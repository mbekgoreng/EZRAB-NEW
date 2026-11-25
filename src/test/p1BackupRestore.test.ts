/**
 * EZRAB P1-A — Backup & Restore hardening (plain-tsx assertion suite, no vitest)
 *
 * Covers (directive P1-A):
 *  (a) round-trip per entity family — seed, export, wipe, import, byte-level equality
 *  (b) restore-after-wipe on a realistic fixture profile (+ relationship integrity)
 *  (c) corrupt / truncated / wrong-kind / wrong-version files rejected with NO writes
 *  (d) schema-version warnings (old → warn; future → reject)
 *  (e) safety-backup creation before restore (download content + recoverable slot)
 *  (f) createBackup content fix (content is valid JSON, kind ezrab-backup, all datasets)
 *  (+) partial-restore failure reporting (quota failure mid-restore)
 *  (+) corrupt envelope dataset preserved raw in the backup (never silently dropped)
 *  (+) export reminder state + backup summary / uncovered-key audit
 *  (+) large-profile performance (export/validate/restore on a ~4 MB profile)
 *  (§3f) admin master-price keys (overlay/history/feed) are never restored:
 *       skipped + reported in preview and result, local values left untouched
 *       (Fast Track §3f — exclusion approach; see backupRestore.ts header)
 *  (A3-6) restore is REPLACE per dataset, never merge: live-only projects
 *       disappear, overlapping projects take the backup version, no
 *       duplicates; restoring the same backup twice is idempotent
 *  (A3-7) post-write read-back verification: a write that silently stores
 *       different bytes fails the restore instead of reporting success
 *
 * Run: npx --yes tsx src/test/p1BackupRestore.test.ts
 * Exit 0 = all checks PASS. Any failure prints FAIL and exits 1.
 *
 * UNIT TEST VERIFIED only — browser verification of the Settings UI flow
 * is run separately by the coordinator.
 */
import assert from 'node:assert';

// --- localStorage shim for Node (with length/key for prefix scanning) ---
const store = new Map<string, string>();
const failKeys = new Set<string>();
// A3-7: keys whose writes "succeed" but silently store different bytes
// (simulates faulty storage — setItem does NOT throw, read-back must catch it).
const tamperKeys = new Set<string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => {
    if (failKeys.has(k)) throw new Error('QuotaExceededError: simulated quota failure');
    if (tamperKeys.has(k)) { store.set(k, '"__tampered__"'); return; }
    store.set(k, String(v));
  },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => { store.clear(); },
  get length() { return store.size; },
  key: (i: number) => [...store.keys()][i] ?? null,
};

import {
  createBackup,
  createSafetyBackup,
  getSafetySlotContent,
  getSafetySlotInfo,
  validateBackup,
  restoreBackup,
  getBackupSummary,
  getBackupReminderState,
  recordBackupExport,
  BACKUP_DATASET_KEYS,
  BACKUP_ENVELOPE_DATASET_KEYS,
  BACKUP_RAW_DATASET_KEYS,
  BACKUP_RESTORE_SKIPPED_ADMIN_KEYS,
  BACKUP_FORMAT_VERSION,
  LAST_EXPORT_KEY,
  MAX_IMPORT_BYTES,
} from '../engine/storage/backupRestore';
import { saveVersioned, loadVersioned, STORAGE_SCHEMA_VERSION } from '../engine/storage/hardenedStorage';

let pass = 0;
let fail = 0;
function check(name: string, fn: () => void): void {
  try {
    fn();
    pass++;
    console.log(`PASS  ${name}`);
  } catch (e: any) {
    fail++;
    console.error(`FAIL  ${name}\n      ${e.message}`);
    process.exitCode = 1;
  }
}

function snapshot(): Map<string, string> {
  return new Map(store);
}
function assertStoreEqual(a: Map<string, string>, b: Map<string, string>, label: string): void {
  assert.strictEqual(a.size, b.size, `${label}: store size ${a.size} !== ${b.size}`);
  for (const [k, v] of a) assert.strictEqual(b.get(k), v, `${label}: key ${k} differs`);
}

function wipe(): void {
  store.clear();
  failKeys.clear();
  tamperKeys.clear();
}

// ---------------------------------------------------------------------------
// Fixture profile: every covered key, shape-correct, with cross-references.
// ---------------------------------------------------------------------------
function seedFixtureProfile(): void {
  // Envelope: core 10
  saveVersioned('ezrab_prod_projects', [
    { id: 'PRJ-1', name: 'Rumah Tinggal 2 Lantai' },
    { id: 'PRJ-2', name: 'Ruko 3 Lantai' },
  ]);
  saveVersioned('ezrab_prod_rab_items', [
    { id: 'R1', projectId: 'PRJ-1', description: 'Pekerjaan galian', unitPrice: 85000, priceSourceKind: 'OFFICIAL_AHSP' },
    { id: 'R2', projectId: 'PRJ-1', description: 'Pekerjaan belum ada harga', unitPrice: null, priceSourceKind: 'UNRESOLVED' },
    { id: 'R3', projectId: 'PRJ-2', description: 'Pekerjaan atap', unitPrice: 120000, priceSourceKind: 'EZRAB_ASSUMPTION' },
  ]);
  saveVersioned('ezrab_prod_work_items', [{ id: 'W1', projectId: 'PRJ-1', name: 'Struktur' }]);
  saveVersioned('ezrab_prod_calculation_runs', [{ id: 'CR1', projectId: 'PRJ-1', total: 123456 }]);
  saveVersioned('ezrab_prod_qto_items', [{ id: 'Q1', projectId: 'PRJ-1', volume: 12.5 }]);
  saveVersioned('ezrab_prod_qto_rab_mappings', [{ qtoId: 'Q1', rabItemId: 'R1', projectId: 'PRJ-1' }]);
  saveVersioned('ezrab_prod_schedule_tasks', [{ id: 'S1', projectId: 'PRJ-1', name: 'Pondasi' }]);
  saveVersioned('ezrab_prod_price_overrides', [{ id: 'O1', projectId: 'PRJ-1', itemId: 'R1', price: 90000 }]);
  saveVersioned('ezrab_prod_version_snapshots', [{ id: 'V1', projectId: 'PRJ-1', at: '2026-11-20T00:00:00.000Z' }]);
  saveVersioned('ezrab_prod_estimate_versions', [{ id: 'E1', projectId: 'PRJ-1', version: 2 }]);
  // Envelope: AI + finalization families
  saveVersioned('ezrab_prod_finalization_keys', { 'fin-1': { key: 'fin-1', projectId: 'PRJ-1', usedAt: 1 } });
  saveVersioned('ezrab_prod_ai_drafts', { 'PRJ-1': { id: 'D1', projectId: 'PRJ-1', items: ['R1'] } });
  saveVersioned('ezrab_prod_ai_intake_contexts', { 'PRJ-1': { projectId: 'PRJ-1', answers: {} } });
  saveVersioned('ezrab_prod_ai_home_state', { 'PRJ-1': { projectId: 'PRJ-1', lastTab: 'chat' } });
  saveVersioned('ezrab_prod_ai_memories', { 'm1': { id: 'm1', text: 'user suka bata ekspos' } });
  saveVersioned('ezrab_prod_ai_preferences', { theme: 'compact' });
  saveVersioned('ezrab_prod_ai_memory_tombstones', { 'm-old': 1730000000000 });
  saveVersioned('ezrab_prod_ai_agent_plans', { 'PRJ-1': { projectId: 'PRJ-1', steps: [] } });
  saveVersioned('ezrab_prod_ai_tool_executions', { 't1': { id: 't1', tool: 'build_universal_draft' } });

  // Raw: JSON arrays / objects / plain strings (shape-correct per reader code)
  const raw: Record<string, unknown> = {
    ezrab_unified_conversations_v2: [
      { id: 'C1', projectId: 'PRJ-1', messages: [{ id: 'M1', role: 'user', content: 'hitung RAB' }] },
      { id: 'C2', projectId: 'PRJ-2', messages: [] },
    ],
    ezrab_unified_conversations_v2_deleted: { 'C-old': 1730000000000 },
    ezrab_magic_ai_sessions_v1: [{ id: 'MS1', projectId: 'PRJ-1', messages: [] }],
    ezrab_ded_analyses_v2: [{ id: 'DA1', projectId: 'PRJ-1', status: 'done' }],
    ezrab_dedai_drafts_v1: [{ id: 'DD1', projectId: 'PRJ-1' }],
    ezrab_ded_attachment_v1: { 'PRJ-1': { analysisId: 'DA1', attachedAt: 1 } },
    ezrab_docai_drafts_v1: [{ id: 'DOC1', projectId: 'PRJ-1', status: 'editing' }],
    ezrab_docai_history_v1: [{ id: 'DH1', at: 1730000000000 }],
    ezrab_docai_library_v1: [{ id: 'DL1', updatedAt: 1730000000000 }],
    ezrab_docai_templates_v1: [{ id: 'DT1', name: 'Surat Custom' }],
    ezrab_docai_company_v1: [{ id: 'CP1', name: 'CV Contoh' }],
    ezrab_custom_ahsp_v1: [{ id: 'A1', code: 'X.1', unit: 'm3', category: 'Pekerjaan', unitPrice: 50000 }],
    ezrab_user_materials_v1: [{ id: 'UM1', name: 'Bata custom' }],
    ezrab_user_material_prices_v1: [{ materialId: 'UM1', price: 750 }],
    ezrab_price_assumptions_v1: [{ id: 'PA1', itemName: 'Semen custom', price: 65000 }],
    ezrab_project_prices_v2: { 'PRJ-1': { R1: 85000 } },
    ezrab_project_overrides_v2: { 'PRJ-1': { R1: 90000 } },
    ezrab_market_review_v1: { refs: [{ id: 'MR1' }], history: [] },
    ezrab_prod_progress_history: { v: 1, savedAt: '2026-11-20T00:00:00.000Z', data: [{ projectId: 'PRJ-1', weekIndex: 1, progressPercent: 40, recordedAt: '2026-11-20' }] },
    ezrab_designs: { 'PRJ-1': [{ id: 'DS1', name: 'Denah A' }] },
    ezrab_db_activities: [{ text: 'Proyek dibuat', time: '2026-11-20', type: 'project' }],
    ezrab_project_material_specs: { 'PRJ-1': { spec: 'K-300' } },
    ezrab_project_backups: [{ projectId: 'PRJ-OLD', deletedAt: 1730000000000 }],
    ezrab_global_estimation_settings_v1: { overhead: 10, profit: 5 },
    ezrab_custom_rab_templates: [{ id: 'CT1', name: 'Template Rumah' }],
    ezrab_template_usage_v1: { 'tpl-1': 3 },
    ezrab_price_audit_v2: [{ id: 'PAU1', at: 1 }],
    ezrab_settings_audit_log_v1: [{ id: 'SA1', timestamp: '2026-11-20T00:00:00.000Z' }],
    ezrab_ai_operations_v1: [{ id: 'OP1', op: 'add-item' }],
    ezrab_ai_action_audit_v1: [{ id: 'AA1', idempotencyKey: 'k-1' }],
    ezrab_ai_feedback_local_v1: [{ id: 'FB1', kind: 'helpful' }],
    ezrab_ai_mutation_audit_v1: [{ id: 'MA1', ts: 1730000000000, actor: 'Peran demo', projectId: 'PRJ-1', projectName: 'Rumah Tinggal 2 Lantai', operation: 'ADD_ITEM', before: null, after: {}, confirmationRef: 'k-1', result: 'executed', outcomeVerified: true, verificationNote: 'sinyal mutator', idempotencyKey: 'k-1', source: 'chat-ai' }],
    'ezrab.adminMasterPriceOverlay.v1': [{ id: 'OV1', itemKey: 'AHSP.1', price: 50000 }],
    'ezrab.masterPriceHistory.v1': [{ id: 'MH1', at: 1730000000000 }],
    'ezrab.priceChangeFeed.v1': [{ id: 'PF1', at: 1730000000000 }],
    'ezrab:company:headers': [{ id: 'CH1', name: 'Kop Utama', slot: 'PRIMARY', type: 'TEXT', content: 'CV Contoh', createdAt: '2026-11-20', updatedAt: '2026-11-20' }],
  };
  for (const [k, v] of Object.entries(raw)) {
    store.set(k, JSON.stringify(v));
  }
  // Raw: plain strings
  store.set('ezrab_prod_active_project_id', 'PRJ-1');
  store.set('ezrab_prod_seeded_v1', '1');
  store.set('ezrab_premium_demo_v1', '1');
  // Raw: dynamic prefixes
  store.set('ezrab_chat_draft_C1', JSON.stringify({ text: 'draf belum terkirim', projectId: 'PRJ-1', savedAt: 1 }));
  store.set('ezrab_chat_draft_C2', JSON.stringify({ text: '', projectId: 'PRJ-2', savedAt: 2 }));
  store.set('ezrab_active_conversation_v2_PRJ-1', 'C1');
  store.set('ezrab_active_ded_analysis_PRJ-1', 'DA1');
  store.set('ezrab_estimator_kurva_weeks_PRJ-1', '12');
  store.set('ezrab:wizard-draft:PRJ-1', JSON.stringify({ selectedDocIds: ['DOC1'], letterNumber: '001/SPH/2026', letterDate: '2026-11-20', recipientName: 'Budi', recipientOrg: 'PT Contoh', signatoryName: 'Ahmad', signatoryPosition: 'Direktur' }));
  store.set('ezrab:custom_templates:global', JSON.stringify([{ id: 'TPL1', name: 'Template Custom' }]));
  // Uncovered keys (must NEVER appear in the backup)
  store.set('ezrab_theme', 'dark');
  store.set('ezrab_role_v1', 'ESTIMATOR');
  store.set('ezrab_gsheets_db_url', 'https://sheets.example.com/secret?key=ABC123');
  store.set('ezrab_currency_rates_v1', JSON.stringify({ USD: 16000 }));
}

function main(): void {
  // ================= (f) createBackup content fix =================
  wipe();
  seedFixtureProfile();
  let exported: string;
  check('(f) createBackup returns content (valid JSON, kind, all datasets)', () => {
    const r = createBackup();
    assert(r.ok, 'createBackup must succeed');
    if (!r.ok) throw new Error('unreachable');
    assert(typeof r.content === 'string' && r.content.length > 1000, 'content is a substantial string');
    assert.strictEqual(r.sizeBytes, r.content.length, 'sizeBytes matches content length');
    const parsed = JSON.parse(r.content);
    assert.strictEqual(parsed.kind, 'ezrab-backup');
    assert.strictEqual(parsed.metadata.formatVersion, BACKUP_FORMAT_VERSION);
    assert.strictEqual(parsed.metadata.schemaVersion, STORAGE_SCHEMA_VERSION);
    for (const k of [...BACKUP_DATASET_KEYS, ...BACKUP_ENVELOPE_DATASET_KEYS]) {
      assert(k in parsed.datasets, `envelope dataset missing: ${k}`);
    }
    for (const k of BACKUP_RAW_DATASET_KEYS) {
      assert(k in parsed.rawDatasets, `raw dataset missing: ${k}`);
    }
    // Prefix-scanned keys present
    assert('ezrab_chat_draft_C1' in parsed.rawDatasets, 'chat draft prefix scanned');
    assert('ezrab_active_conversation_v2_PRJ-1' in parsed.rawDatasets, 'active conversation prefix scanned');
    assert('ezrab_active_ded_analysis_PRJ-1' in parsed.rawDatasets, 'active ded prefix scanned');
    assert('ezrab_estimator_kurva_weeks_PRJ-1' in parsed.rawDatasets, 'kurva weeks prefix scanned');
    assert('ezrab:wizard-draft:PRJ-1' in parsed.rawDatasets, 'wizard draft prefix scanned');
    assert('ezrab:custom_templates:global' in parsed.rawDatasets, 'custom templates prefix scanned');
    // Excluded keys never appear
    for (const k of ['ezrab_theme', 'ezrab_role_v1', 'ezrab_gsheets_db_url', 'ezrab_currency_rates_v1']) {
      assert(!(k in parsed.datasets), `excluded key in datasets: ${k}`);
      assert(!(k in parsed.rawDatasets), `excluded key in rawDatasets: ${k}`);
      assert(!r.content.includes('ABC123'), 'secret URL must not leak into backup content');
    }
    // Counts + project summary
    assert.strictEqual(parsed.metadata.datasetCounts['ezrab_prod_projects'], 2);
    assert.strictEqual(parsed.metadata.datasetCounts['ezrab_prod_rab_items'], 3);
    assert.strictEqual(parsed.metadata.datasetCounts['ezrab_unified_conversations_v2'], 2);
    assert.strictEqual(parsed.metadata.projectSummary.length, 2);
    assert.strictEqual(parsed.metadata.projectSummary[0].itemCount, 2);
    exported = r.content;
  });

  // ================= (a)+(b) full round-trip + relationships =================
  check('(a/b) round-trip per family: byte-level equality after wipe + restore', () => {
    const before = snapshot();
    wipe();
    assert.strictEqual(store.size, 0, 'wipe must clear everything');
    const restore = restoreBackup(exported!);
    assert(restore.ok, `restore must succeed: ${!restore.ok ? restore.error : ''}`);
    if (!restore.ok) throw new Error('unreachable');
    // Raw keys: exact byte equality — EXCEPT admin-only keys (§3f), which
    // restore never writes: after a wipe they stay absent, and the result
    // reports them as skipped.
    const skippedAdmin = new Set<string>(BACKUP_RESTORE_SKIPPED_ADMIN_KEYS);
    for (const k of [...BACKUP_RAW_DATASET_KEYS]) {
      if (skippedAdmin.has(k)) continue;
      assert.strictEqual(store.get(k), before.get(k), `raw key differs: ${k}`);
    }
    for (const k of BACKUP_RESTORE_SKIPPED_ADMIN_KEYS) {
      assert(!store.has(k), `admin-only key must NOT be restored: ${k}`);
    }
    assert.deepStrictEqual(
      [...restore.skippedKeys].sort(),
      [...BACKUP_RESTORE_SKIPPED_ADMIN_KEYS].sort(),
      'restore reports all three admin keys as skipped'
    );
    assert(
      restore.warnings.some((w) => w.includes('Dilewati saat restore')),
      'restore warnings mention the skip'
    );
    for (const k of ['ezrab_chat_draft_C1', 'ezrab_chat_draft_C2', 'ezrab_active_conversation_v2_PRJ-1', 'ezrab_active_ded_analysis_PRJ-1', 'ezrab_estimator_kurva_weeks_PRJ-1', 'ezrab:wizard-draft:PRJ-1', 'ezrab:custom_templates:global']) {
      assert.strictEqual(store.get(k), before.get(k), `prefix key differs: ${k}`);
    }
    // Envelope keys: decoded-data equality (envelope writeId/savedAt legitimately change)
    for (const k of [...BACKUP_DATASET_KEYS, ...BACKUP_ENVELOPE_DATASET_KEYS]) {
      const beforeData = JSON.parse(before.get(k)!).data;
      const after = loadVersioned(k);
      assert(after.ok, `envelope key unreadable after restore: ${k}`);
      if (after.ok) {
        assert.strictEqual(JSON.stringify(after.data), JSON.stringify(beforeData), `envelope data differs: ${k}`);
      }
    }
    // Uncovered keys are NOT restored (they were wiped and are not in the backup)
    assert(!store.has('ezrab_theme'), 'uncovered key must not be restored');
    assert(!store.has('ezrab_role_v1'), 'role key must not be restored');
    // Relationship integrity: RAB items still reference existing projects;
    // QTO mapping still references existing QTO + RAB ids.
    const projects = (loadVersioned<any[]>('ezrab_prod_projects') as any).data as Array<{ id: string }>;
    const rab = (loadVersioned<any[]>('ezrab_prod_rab_items') as any).data as Array<{ id: string; projectId: string }>;
    const qto = (loadVersioned<any[]>('ezrab_prod_qto_items') as any).data as Array<{ id: string }>;
    const maps = (loadVersioned<any[]>('ezrab_prod_qto_rab_mappings') as any).data as Array<{ qtoId: string; rabItemId: string }>;
    const projectIds = new Set(projects.map((p) => p.id));
    for (const item of rab) assert(projectIds.has(item.projectId), `RAB ${item.id} references missing project`);
    for (const m of maps) {
      assert(qto.some((q) => q.id === m.qtoId), `mapping references missing QTO ${m.qtoId}`);
      assert(rab.some((r) => r.id === m.rabItemId), `mapping references missing RAB ${m.rabItemId}`);
    }
    // Provenance preserved: unresolved item still null-priced
    const unresolved = rab.find((r) => r.id === 'R2') as any;
    assert.strictEqual(unresolved.unitPrice, null, 'unresolved price stays null');
    assert.strictEqual(unresolved.priceSourceKind, 'UNRESOLVED');
  });

  // ================= (c) rejection with zero writes =================
  const goodBackup = (() => {
    wipe();
    seedFixtureProfile();
    const r = createBackup();
    if (!r.ok) throw new Error('seed backup failed');
    return r.content;
  })();
  const rejectCases: Array<[string, string]> = [
    ['corrupt JSON', '{invalid json'],
    ['truncated JSON', goodBackup.slice(0, Math.floor(goodBackup.length / 2))],
    ['wrong kind', JSON.stringify({ kind: 'not-a-backup', metadata: {}, datasets: {} })],
    ['wrong format version', JSON.stringify({ ...JSON.parse(goodBackup), metadata: { ...JSON.parse(goodBackup).metadata, formatVersion: 99 } })],
    ['missing datasets', JSON.stringify({ kind: 'ezrab-backup', metadata: { formatVersion: 1, schemaVersion: 2, createdAt: '', datasetCounts: {}, projectSummary: [] } })],
    ['projects not an array', JSON.stringify({ ...JSON.parse(goodBackup), datasets: { ...JSON.parse(goodBackup).datasets, ezrab_prod_projects: 'rusak' } })],
    ['raw value not a string', JSON.stringify({ ...JSON.parse(goodBackup), rawDatasets: { ...JSON.parse(goodBackup).rawDatasets, ezrab_unified_conversations_v2: 42 } })],
    ['raw JSON corrupt', JSON.stringify({ ...JSON.parse(goodBackup), rawDatasets: { ...JSON.parse(goodBackup).rawDatasets, ezrab_docai_history_v1: '[{broken' } })],
    ['raw shape wrong', JSON.stringify({ ...JSON.parse(goodBackup), rawDatasets: { ...JSON.parse(goodBackup).rawDatasets, ezrab_docai_history_v1: '{"bukan":"array"}' } })],
    ['conversation without messages', JSON.stringify({ ...JSON.parse(goodBackup), rawDatasets: { ...JSON.parse(goodBackup).rawDatasets, ezrab_unified_conversations_v2: JSON.stringify([{ id: 'CX' }]) } })],
    ['unknown envelope key', JSON.stringify({ ...JSON.parse(goodBackup), datasets: { ...JSON.parse(goodBackup).datasets, ezrab_evil_key: [] } })],
    ['unknown raw key (role plant)', JSON.stringify({ ...JSON.parse(goodBackup), rawDatasets: { ...JSON.parse(goodBackup).rawDatasets, ezrab_role_v1: 'SUPER_ADMIN' } })],
    ['kurva weeks not numeric', JSON.stringify({ ...JSON.parse(goodBackup), rawDatasets: { ...JSON.parse(goodBackup).rawDatasets, 'ezrab_estimator_kurva_weeks_PRJ-1': 'bukan-angka' } })],
    ['wizard draft not object', JSON.stringify({ ...JSON.parse(goodBackup), rawDatasets: { ...JSON.parse(goodBackup).rawDatasets, 'ezrab:wizard-draft:PRJ-1': '"bukan-object"' } })],
    ['company headers not array', JSON.stringify({ ...JSON.parse(goodBackup), rawDatasets: { ...JSON.parse(goodBackup).rawDatasets, 'ezrab:company:headers': '{"bukan":"array"}' } })],
    ['mutation audit entry without id', JSON.stringify({ ...JSON.parse(goodBackup), rawDatasets: { ...JSON.parse(goodBackup).rawDatasets, ezrab_ai_mutation_audit_v1: JSON.stringify([{ ts: 1 }]) } })],
    ['missing schema version', JSON.stringify({ ...JSON.parse(goodBackup), metadata: { ...JSON.parse(goodBackup).metadata, schemaVersion: undefined } })],
    ['oversize file', 'x'.repeat(MAX_IMPORT_BYTES + 1)],
  ];
  for (const [name, bad] of rejectCases) {
    check(`(c) rejected with zero writes: ${name}`, () => {
      wipe();
      seedFixtureProfile();
      const before = snapshot();
      const v = validateBackup(bad);
      assert(!v.ok, `validateBackup must reject: ${name}`);
      const r = restoreBackup(bad);
      assert(!r.ok, `restoreBackup must reject: ${name}`);
      if (!r.ok) assert.strictEqual(r.restoredKeys.length, 0, 'no keys restored on rejection');
      assertStoreEqual(before, snapshot(), name);
    });
  }

  // ================= (d) schema-version warnings =================
  check('(d) old schema version → warning, restore succeeds', () => {
    const parsed = JSON.parse(goodBackup);
    parsed.metadata.schemaVersion = 1;
    const v = validateBackup(JSON.stringify(parsed));
    assert(v.ok, 'old schema must validate');
    if (v.ok) assert(v.warnings.some((w) => w.includes('schema lama')), 'old-schema warning present');
  });
  check('(d) future schema version → rejected', () => {
    const parsed = JSON.parse(goodBackup);
    parsed.metadata.schemaVersion = 999;
    const v = validateBackup(JSON.stringify(parsed));
    assert(!v.ok, 'future schema must be rejected');
  });
  check('(d) metadata count mismatch → warning (file content wins)', () => {
    const parsed = JSON.parse(goodBackup);
    parsed.metadata.datasetCounts['ezrab_prod_projects'] = 999;
    const v = validateBackup(JSON.stringify(parsed));
    assert(v.ok, 'count mismatch must not reject');
    if (v.ok) {
      assert(v.warnings.some((w) => w.includes('tidak cocok')), 'count-mismatch warning present');
      assert.strictEqual(v.counts['ezrab_prod_projects'], 2, 'recomputed count wins');
    }
  });

  // ================= (e) safety backup =================
  check('(e) safety backup: content + slot, created before restore', () => {
    wipe();
    seedFixtureProfile();
    const before = snapshot();
    const safety = createSafetyBackup();
    assert(safety.ok, 'safety backup must succeed');
    assert(safety.slotStored, 'slot must be stored');
    assert(safety.filename!.startsWith('ezrab-backup-pengaman-'), 'safety filename prefix');
    assert(safety.content, 'safety content present');
    const slot = getSafetySlotContent();
    assert.strictEqual(slot, safety.content, 'slot content equals returned content');
    const info = getSafetySlotInfo();
    assert(info.exists && !info.corrupt && info.createdAt, 'slot info readable');
    // The safety backup restores the pre-restore state exactly.
    wipe();
    const r = restoreBackup(safety.content!);
    assert(r.ok, 'restoring safety backup must succeed');
    // §3f: admin-only keys are never restored, even from a safety backup —
    // the restoring browser keeps its own admin config (here: none, after wipe).
    assert.deepStrictEqual(
      [...r.skippedKeys].sort(),
      [...BACKUP_RESTORE_SKIPPED_ADMIN_KEYS].sort(),
      'safety restore reports admin keys as skipped'
    );
    const skippedAdmin = new Set<string>(BACKUP_RESTORE_SKIPPED_ADMIN_KEYS);
    for (const k of [...BACKUP_RAW_DATASET_KEYS]) {
      if (skippedAdmin.has(k)) continue;
      assert.strictEqual(store.get(k), before.get(k), `safety restore raw differs: ${k}`);
    }
    for (const k of BACKUP_RESTORE_SKIPPED_ADMIN_KEYS) {
      assert(!store.has(k), `admin-only key must NOT be restored from safety backup: ${k}`);
    }
    const projects = loadVersioned<any[]>('ezrab_prod_projects');
    assert(projects.ok && projects.data.length === 2, 'safety restore keeps projects');
  });

  // ================= partial-restore failure reporting =================
  check('(+) mid-restore quota failure reports restored keys + failed key', () => {
    wipe();
    seedFixtureProfile();
    const created = createBackup();
    if (!created.ok) throw new Error('createBackup failed');
    wipe();
    // Fail writes to ezrab_prod_qto_items (envelope, 5th of the 10 core keys)
    failKeys.add('ezrab_prod_qto_items');
    const r = restoreBackup(created.content);
    assert(!r.ok, 'restore must fail on quota error');
    if (!r.ok) {
      assert.strictEqual(r.failedKey, 'ezrab_prod_qto_items');
      assert(r.restoredKeys.length > 0, 'some keys restored before failure');
      assert(!r.restoredKeys.includes('ezrab_prod_qto_items'), 'failed key not in restored list');
      assert(r.error.includes('backup pengaman'), 'error points to safety backup recovery');
    }
    failKeys.clear();
    // Recovery: restore the safety backup (full retry) succeeds.
    const retry = restoreBackup(created.content);
    assert(retry.ok, 'retry after clearing failure must succeed');
  });

  // ================= corrupt envelope dataset preserved raw =================
  check('(+) corrupt envelope dataset is preserved raw, never silently dropped', () => {
    wipe();
    seedFixtureProfile();
    store.set('ezrab_prod_projects', '{corrupt-json!!!');
    const created = createBackup();
    assert(created.ok, 'createBackup must succeed despite corrupt dataset');
    if (!created.ok) throw new Error('unreachable');
    const parsed = JSON.parse(created.content);
    assert.strictEqual(parsed.rawDatasets['ezrab_prod_projects'], '{corrupt-json!!!', 'corrupt raw preserved');
    assert(created.metadata.warnings?.some((w: string) => w.includes('rusak')), 'corrupt warning in metadata');
    wipe();
    const r = restoreBackup(created.content);
    assert(r.ok, 'restore with corrupt-preserved dataset must succeed');
    assert.strictEqual(store.get('ezrab_prod_projects'), '{corrupt-json!!!', 'corrupt bytes restored exactly');
  });

  // ================= empty profile (regression: shape-aware placeholders) =================
  check('(+) empty profile: export → validate → restore succeeds', () => {
    wipe();
    const created = createBackup();
    assert(created.ok, 'createBackup on empty profile must succeed');
    if (!created.ok) throw new Error('unreachable');
    const v = validateBackup(created.content);
    assert(v.ok, `empty-profile backup must validate: ${!v.ok ? v.error : ''}`);
    const r = restoreBackup(created.content);
    assert(r.ok, 'empty-profile restore must succeed');
  });

  // ================= large profile (scope 7: no UI freeze/crash) =================
  check('(+) large profile (~4 MB): export + validate + restore complete promptly', () => {
    wipe();
    seedFixtureProfile();
    // ~4 MB of conversation content — the largest realistic localStorage
    // profile (browser quota is ~5 MB). Each step must finish in seconds,
    // not hang the tab.
    const bigText = 'x'.repeat(1024);
    const bigMessages = Array.from({ length: 4000 }, (_, i) => ({ id: `BM${i}`, role: 'user', content: bigText }));
    store.set('ezrab_unified_conversations_v2', JSON.stringify([{ id: 'C-BIG', projectId: 'PRJ-1', messages: bigMessages }]));
    const t0 = Date.now();
    const created = createBackup();
    assert(created.ok, 'large-profile export must succeed');
    if (!created.ok) throw new Error('unreachable');
    const exportMs = Date.now() - t0;
    assert(created.sizeBytes > 4 * 1024 * 1024, `profile should exceed 4 MB (got ${created.sizeBytes})`);
    assert(exportMs < 5000, `export took ${exportMs} ms (limit 5000)`);
    const t1 = Date.now();
    const v = validateBackup(created.content);
    assert(v.ok, 'large-profile backup must validate');
    const validateMs = Date.now() - t1;
    assert(validateMs < 5000, `validate took ${validateMs} ms (limit 5000)`);
    const before = store.get('ezrab_unified_conversations_v2');
    wipe();
    const t2 = Date.now();
    const r = restoreBackup(created.content);
    assert(r.ok, 'large-profile restore must succeed');
    const restoreMs = Date.now() - t2;
    assert(restoreMs < 5000, `restore took ${restoreMs} ms (limit 5000)`);
    assert.strictEqual(store.get('ezrab_unified_conversations_v2'), before, 'large conversation restored byte-exact');
  });

  // ================= reminder + summary =================
  check('(+) export reminder: never → remind; just exported → no remind; old → remind', () => {
    wipe();
    let s = getBackupReminderState();
    assert(s.needsReminder && s.lastExportAt === null, 'never exported → reminder');
    recordBackupExport();
    s = getBackupReminderState();
    assert(!s.needsReminder && s.daysSinceExport === 0, 'just exported → no reminder');
    const fortyDaysAgo = new Date(Date.now() - 40 * 86_400_000).toISOString();
    store.set(LAST_EXPORT_KEY, fortyDaysAgo);
    s = getBackupReminderState();
    assert(s.needsReminder && s.daysSinceExport === 40, '40-day-old export → reminder');
    // Reminder key itself is never part of a backup
    const created = createBackup();
    if (!created.ok) throw new Error('createBackup failed');
    const parsed = JSON.parse(created.content);
    assert(!(LAST_EXPORT_KEY in (parsed.rawDatasets ?? {})), 'reminder key not in backup');
  });
  check('(+) getBackupSummary counts + uncovered-key audit', () => {
    wipe();
    seedFixtureProfile();
    const s = getBackupSummary();
    const byKey = new Map(s.datasets.map((d) => [d.key, d]));
    assert.strictEqual(byKey.get('ezrab_prod_projects')!.count, 2);
    assert.strictEqual(byKey.get('ezrab_prod_rab_items')!.count, 3);
    assert.strictEqual(byKey.get('ezrab_unified_conversations_v2')!.count, 2);
    assert.strictEqual(byKey.get('ezrab_prod_active_project_id')!.count, 1);
    assert(byKey.get('ezrab_chat_draft_C1')!.present, 'prefix key in summary');
    assert(s.totalItems > 0 && s.totalBytes > 0, 'totals positive');
    assert(s.uncoveredEzrabKeys.includes('ezrab_theme'), 'theme flagged uncovered');
    assert(s.uncoveredEzrabKeys.includes('ezrab_role_v1'), 'role flagged uncovered');
    assert(s.uncoveredEzrabKeys.includes('ezrab_gsheets_db_url'), 'gsheets url flagged uncovered');
  });

  // ================= (§3f) admin master-price keys never cross browsers =================
  check('(§3f) export still includes admin keys as an archive (format unchanged)', () => {
    wipe();
    seedFixtureProfile();
    const created = createBackup();
    assert(created.ok, 'createBackup must succeed');
    if (!created.ok) throw new Error('unreachable');
    const parsed = JSON.parse(created.content);
    for (const k of BACKUP_RESTORE_SKIPPED_ADMIN_KEYS) {
      assert(k in parsed.rawDatasets, `admin key still exported: ${k}`);
      assert.strictEqual(parsed.rawDatasets[k], store.get(k), `exported admin value byte-exact: ${k}`);
    }
    assert.strictEqual(parsed.metadata.formatVersion, BACKUP_FORMAT_VERSION, 'format version unchanged');
  });

  check('(§3f) validateBackup preview reports admin keys as skipped + warning', () => {
    wipe();
    seedFixtureProfile();
    const created = createBackup();
    if (!created.ok) throw new Error('createBackup failed');
    const v = validateBackup(created.content);
    assert(v.ok, 'fixture backup must validate');
    if (!v.ok) throw new Error('unreachable');
    assert.deepStrictEqual(
      [...v.skippedKeys].sort(),
      [...BACKUP_RESTORE_SKIPPED_ADMIN_KEYS].sort(),
      'preview lists all three admin keys as skipped'
    );
    assert(
      v.warnings.some((w) => w.includes('Dilewati saat restore') && w.includes('Overlay harga master (admin)')),
      'preview warning names the skipped overlay'
    );
  });

  check('(§3f) restore leaves pre-existing local admin config untouched, restores everything else', () => {
    // Browser B has its OWN admin overlay (different prices) + history/feed.
    wipe();
    seedFixtureProfile();
    const created = createBackup();
    if (!created.ok) throw new Error('createBackup failed');
    const browserBOverlay = JSON.stringify([{ id: 'OV-B', itemKey: 'AHSP.9', price: 999999 }]);
    const browserBHistory = JSON.stringify([{ id: 'MH-B', at: 1 }]);
    const browserBFeed = JSON.stringify([{ id: 'PF-B', at: 1 }]);
    // Simulate browser B: wipe everything, then put B's own admin config back.
    wipe();
    store.set('ezrab.adminMasterPriceOverlay.v1', browserBOverlay);
    store.set('ezrab.masterPriceHistory.v1', browserBHistory);
    store.set('ezrab.priceChangeFeed.v1', browserBFeed);
    const r = restoreBackup(created.content);
    assert(r.ok, `restore must succeed: ${!r.ok ? r.error : ''}`);
    if (!r.ok) throw new Error('unreachable');
    assert.deepStrictEqual(
      [...r.skippedKeys].sort(),
      [...BACKUP_RESTORE_SKIPPED_ADMIN_KEYS].sort(),
      'restore reports all three admin keys as skipped'
    );
    const skippedAdmin = new Set<string>(BACKUP_RESTORE_SKIPPED_ADMIN_KEYS);
    assert(
      !r.restoredKeys.some((k) => skippedAdmin.has(k)),
      'skipped keys never appear in restoredKeys'
    );
    // B's own admin config untouched (not overwritten by A's backup, not wiped).
    assert.strictEqual(store.get('ezrab.adminMasterPriceOverlay.v1'), browserBOverlay, "B's overlay untouched");
    assert.strictEqual(store.get('ezrab.masterPriceHistory.v1'), browserBHistory, "B's history untouched");
    assert.strictEqual(store.get('ezrab.priceChangeFeed.v1'), browserBFeed, "B's feed untouched");
    // Everything else restored from the file.
    const projects = loadVersioned<any[]>('ezrab_prod_projects');
    assert(projects.ok && projects.data.length === 2, 'projects restored');
    assert(store.get('ezrab_unified_conversations_v2') !== undefined, 'conversations restored');
    assert.strictEqual(store.get('ezrab_prod_active_project_id'), 'PRJ-1', 'active project restored');
  });

  check('(§3f) file without admin keys → no skip, no skip warning', () => {
    wipe();
    seedFixtureProfile();
    for (const k of BACKUP_RESTORE_SKIPPED_ADMIN_KEYS) store.delete(k);
    const created = createBackup();
    if (!created.ok) throw new Error('createBackup failed');
    const v = validateBackup(created.content);
    assert(v.ok, 'backup without admin keys must validate');
    if (!v.ok) throw new Error('unreachable');
    assert.strictEqual(v.skippedKeys.length, 0, 'no skipped keys when file has none');
    assert(!v.warnings.some((w) => w.includes('Dilewati saat restore')), 'no skip warning when file has none');
    wipe();
    const r = restoreBackup(created.content);
    assert(r.ok, 'restore must succeed');
    if (!r.ok) throw new Error('unreachable');
    assert.strictEqual(r.skippedKeys.length, 0, 'restore reports no skipped keys');
  });

  // ================= (A3-6) restore REPLACES — never merges, never duplicates =================
  check('(A3-6) restore over live data REPLACES it: no merge, no duplicate projects, idempotent', () => {
    // Backup A: fixture profile (PRJ-1 'Rumah Tinggal 2 Lantai', PRJ-2, 3 RAB items).
    wipe();
    seedFixtureProfile();
    const created = createBackup();
    if (!created.ok) throw new Error('createBackup failed');
    // Live browser state is DIFFERENT: PRJ-1 with another name, plus a
    // live-only project PRJ-LIVE with its own RAB item.
    wipe();
    saveVersioned('ezrab_prod_projects', [
      { id: 'PRJ-1', name: 'Nama live yang berbeda' },
      { id: 'PRJ-LIVE', name: 'Proyek hanya di live' },
    ]);
    saveVersioned('ezrab_prod_rab_items', [
      { id: 'R1', projectId: 'PRJ-1', description: 'Versi live', unitPrice: 1, priceSourceKind: 'MANUAL' },
      { id: 'R-LIVE', projectId: 'PRJ-LIVE', description: 'Item live saja', unitPrice: 5000, priceSourceKind: 'MANUAL' },
    ]);
    store.set('ezrab_prod_active_project_id', 'PRJ-LIVE');
    const r = restoreBackup(created.content);
    assert(r.ok, `restore must succeed: ${!r.ok ? r.error : ''}`);
    // Overlapping project takes the BACKUP version; live-only project is gone
    // (whole-dataset replace — nothing is merged or appended).
    const projects = (loadVersioned<any[]>('ezrab_prod_projects') as any).data as Array<{ id: string; name: string }>;
    assert.strictEqual(projects.length, 2, 'project count equals backup count (no merge, no duplicates)');
    assert.strictEqual(new Set(projects.map((p) => p.id)).size, 2, 'no duplicate project ids');
    assert.strictEqual(projects.find((p) => p.id === 'PRJ-1')!.name, 'Rumah Tinggal 2 Lantai', 'PRJ-1 replaced by backup version');
    assert(!projects.some((p) => p.id === 'PRJ-LIVE'), 'live-only project removed by replace');
    const rab = (loadVersioned<any[]>('ezrab_prod_rab_items') as any).data as Array<{ id: string }>;
    assert.strictEqual(rab.length, 3, 'RAB count equals backup count');
    assert.strictEqual(new Set(rab.map((x) => x.id)).size, 3, 'no duplicate RAB ids');
    assert(!rab.some((x) => x.id === 'R-LIVE'), 'live-only RAB item removed by replace');
    assert.strictEqual(store.get('ezrab_prod_active_project_id'), 'PRJ-1', 'active project pointer replaced');
    // Idempotent: restoring the same backup again yields the identical state.
    const beforeSecond = snapshot();
    const r2 = restoreBackup(created.content);
    assert(r2.ok, 'second restore of the same backup must succeed');
    const afterSecond = snapshot();
    // Envelope bytes differ (fresh writeId/savedAt) — compare decoded data.
    for (const k of [...BACKUP_DATASET_KEYS, ...BACKUP_ENVELOPE_DATASET_KEYS]) {
      const a = JSON.parse(beforeSecond.get(k)!).data;
      const b = JSON.parse(afterSecond.get(k)!).data;
      assert.strictEqual(JSON.stringify(b), JSON.stringify(a), `second restore changed ${k}`);
    }
    const projects2 = (loadVersioned<any[]>('ezrab_prod_projects') as any).data as Array<{ id: string }>;
    assert.strictEqual(projects2.length, 2, 'second restore still 2 projects (no duplication)');
  });

  // ================= (A3-7) post-write read-back verification =================
  check('(A3-7) silent storage mismatch fails restore instead of reporting success', () => {
    // (a) Envelope key: write "succeeds" but stores tampered bytes.
    wipe();
    seedFixtureProfile();
    const created = createBackup();
    if (!created.ok) throw new Error('createBackup failed');
    wipe();
    tamperKeys.add('ezrab_prod_projects');
    const rEnv = restoreBackup(created.content);
    assert(!rEnv.ok, 'restore must FAIL when the envelope read-back mismatches');
    if (!rEnv.ok) {
      assert.strictEqual(rEnv.failedKey, 'ezrab_prod_projects');
      assert(!rEnv.restoredKeys.includes('ezrab_prod_projects'), 'unverified key not in restoredKeys');
      assert(rEnv.error.includes('verifikasi sesudah tulis gagal'), 'error names the verification failure');
      assert(rEnv.error.includes('backup pengaman'), 'error points to safety backup recovery');
    }
    // (b) Raw key: same treatment on the raw path.
    tamperKeys.clear();
    wipe();
    tamperKeys.add('ezrab_docai_history_v1');
    const rRaw = restoreBackup(created.content);
    assert(!rRaw.ok, 'restore must FAIL when the raw read-back mismatches');
    if (!rRaw.ok) {
      assert.strictEqual(rRaw.failedKey, 'ezrab_docai_history_v1');
      assert(!rRaw.restoredKeys.includes('ezrab_docai_history_v1'), 'unverified key not in restoredKeys');
      assert(rRaw.error.includes('verifikasi sesudah tulis gagal'), 'error names the verification failure');
    }
    // (c) Sanity: with no tampering, the same backup restores fine.
    tamperKeys.clear();
    wipe();
    const rOk = restoreBackup(created.content);
    assert(rOk.ok, 'untampered restore must succeed');
    if (rOk.ok) {
      assert(rOk.restoredKeys.includes('ezrab_prod_projects'), 'verified envelope key reported restored');
      assert(rOk.restoredKeys.includes('ezrab_docai_history_v1'), 'verified raw key reported restored');
    }
  });

  console.log(`\n${pass} passed, ${fail} failed.`);
  if (fail > 0) process.exitCode = 1;
}

main();

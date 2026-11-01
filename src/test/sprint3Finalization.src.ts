/**
 * Sprint 3 — Workstream C: G4 finalization safety + G2 Option A counting.
 *
 * WHAT IS UNIT-TESTED HERE (executed against real modules):
 * - src/ai-tools/ded-ai-estimate/finalizationKey.ts — the exact key builder
 *   and assumption counters the ded-ai view calls (pure, imported).
 * - src/context/ProjectContext.tsx — the exported PURE registry helpers
 *   (isFinalizationKeyApplied / applyFinalizationKey /
 *   removeFinalizationKeysForProject) that bulkAddRabItems itself calls.
 *   The bulkAdd DECISION FLOW is exercised through a thin simulation that
 *   composes these real helpers in the same order bulkAddRabItems does:
 *   existence → duplicate-check → insert → record-key.
 *
 * WHAT IS ONLY CODE-INSPECTED (source-contract checks at the bottom):
 * - The React closure of bulkAddRabItems (setState/factory wiring cannot
 *   execute without rendering the provider; no existing suite renders it).
 *   The checks pin the wiring: existence gate ordered BEFORE record
 *   construction, registry persistence key present, view passing the key
 *   and surfacing the duplicate outcome, G2 disclosure strings present.
 */

import {
  buildFinalizationKey,
  canonicalizeFinalizationItems,
  countAssumptionItems,
  resolveAssumptionCount,
} from '../ai-tools/ded-ai-estimate/finalizationKey';
import {
  isFinalizationKeyApplied,
  applyFinalizationKey,
  removeFinalizationKeysForProject,
  type FinalizationKeyRegistry,
} from '../context/ProjectContext';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

let pass = 0;
let fail = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    pass++;
    console.log(`  PASS ${name}`);
  } else {
    fail++;
    failures.push(name);
    console.log(`  FAIL ${name}${detail ? ` :: ${detail}` : ''}`);
  }
}

// ============================================================================
// Finalization key identity
// ============================================================================
console.log('\n== finalizationKey: identitas deterministik ==');
const itemsA = [
  { description: 'Beton K-225', unit: 'm3', volume: 12.5, unitPrice: 1250000, priceSourceKind: 'EZRAB_ASSUMPTION' },
  { description: 'Pekerjaan Tanah Galian', unit: 'm3', volume: 40, unitPrice: 85000, priceSourceKind: 'OFFICIAL_AHSP' },
];
const itemsReordered = [itemsA[1], itemsA[0]];
check(
  'set item sama, urutan berbeda -> kunci sama',
  buildFinalizationKey('PRJ-1', itemsA) === buildFinalizationKey('PRJ-1', itemsReordered)
);
check(
  'kuantitas berubah -> kunci berbeda',
  buildFinalizationKey('PRJ-1', itemsA) !==
    buildFinalizationKey('PRJ-1', [{ ...itemsA[0], volume: 13 }, itemsA[1]])
);
check(
  'harga berubah -> kunci berbeda',
  buildFinalizationKey('PRJ-1', itemsA) !==
    buildFinalizationKey('PRJ-1', [{ ...itemsA[0], unitPrice: 1300000 }, itemsA[1]])
);
check(
  'priceSourceKind berubah -> kunci berbeda',
  buildFinalizationKey('PRJ-1', itemsA) !==
    buildFinalizationKey('PRJ-1', [{ ...itemsA[0], priceSourceKind: 'UNRESOLVED' }, itemsA[1]])
);
check(
  'item sama, proyek berbeda -> kunci berbeda (finalisasi per proyek sah)',
  buildFinalizationKey('PRJ-1', itemsA) !== buildFinalizationKey('PRJ-2', itemsA)
);
check(
  'normalisasi: spasi/kapital deskripsi tidak mengubah kunci',
  buildFinalizationKey('PRJ-1', itemsA) ===
    buildFinalizationKey('PRJ-1', [{ ...itemsA[0], description: '  beton k-225 ' }, itemsA[1]])
);
check(
  'canonicalize deterministik (string sama untuk input sama)',
  canonicalizeFinalizationItems(itemsA) === canonicalizeFinalizationItems(itemsReordered)
);
check(
  'kunci stabil lintas pemanggilan (hash murni)',
  buildFinalizationKey('PRJ-1', itemsA) === buildFinalizationKey('PRJ-1', itemsA)
);

// ============================================================================
// Registry semantics — the decision flow bulkAddRabItems executes, composed
// from the REAL exported helpers in the same order as the store boundary:
//   1. project existence (against the live project list)
//   2. duplicate check on the registry
//   3. insert (counted) and only then record the key
// ============================================================================
console.log('\n== G4: semantik registry finalisasi (helper asli ProjectContext) ==');
type SimOutcome = 'INSERTED' | 'DUPLICATE' | 'PROJECT_NOT_FOUND';
function simulateBulkAdd(
  registry: FinalizationKeyRegistry,
  projectIds: readonly string[],
  pid: string,
  key: string | undefined,
  itemCount: number
): { outcome: SimOutcome; inserted: number; registry: FinalizationKeyRegistry } {
  if (!projectIds.includes(pid)) return { outcome: 'PROJECT_NOT_FOUND', inserted: 0, registry };
  if (key && isFinalizationKeyApplied(registry, pid, key)) {
    return { outcome: 'DUPLICATE', inserted: 0, registry };
  }
  return {
    outcome: 'INSERTED',
    inserted: itemCount,
    registry: key ? applyFinalizationKey(registry, pid, key) : registry,
  };
}

const projects = ['PRJ-1', 'PRJ-2'];
const keyP1 = buildFinalizationKey('PRJ-1', itemsA);
let registry: FinalizationKeyRegistry = {};

let r1 = simulateBulkAdd(registry, projects, 'PRJ-1', keyP1, itemsA.length);
check('finalisasi pertama: INSERTED + semua item masuk', r1.outcome === 'INSERTED' && r1.inserted === 2);
registry = r1.registry;
check('kunci tercatat untuk proyek itu', isFinalizationKeyApplied(registry, 'PRJ-1', keyP1));

let r2 = simulateBulkAdd(registry, projects, 'PRJ-1', keyP1, itemsA.length);
check(
  'kunci sama + proyek sama (klik ganda / retry / state UI reset): DUPLICATE, 0 baris baru',
  r2.outcome === 'DUPLICATE' && r2.inserted === 0
);
check('registry tidak berubah oleh percobaan duplikat', r2.registry === registry || isFinalizationKeyApplied(r2.registry, 'PRJ-1', keyP1));

const keyP2 = buildFinalizationKey('PRJ-2', itemsA);
let r3 = simulateBulkAdd(registry, projects, 'PRJ-2', keyP2, itemsA.length);
check(
  'analisis sama ke proyek LAIN: kunci berbeda -> INSERTED (sah)',
  keyP2 !== keyP1 && r3.outcome === 'INSERTED' && r3.inserted === 2
);
registry = r3.registry;

const changedItems = [{ ...itemsA[0], volume: 99 }, itemsA[1]];
const keyChanged = buildFinalizationKey('PRJ-1', changedItems);
let r4 = simulateBulkAdd(registry, projects, 'PRJ-1', keyChanged, changedItems.length);
check(
  'analisis baru dengan isi berbeda ke proyek sama: INSERTED (revisi sah tidak tertahan)',
  r4.outcome === 'INSERTED' && r4.inserted === 2
);
registry = r4.registry;

let r5 = simulateBulkAdd(registry, projects, 'PRJ-SUDAH-DIHAPUS', buildFinalizationKey('PRJ-SUDAH-DIHAPUS', itemsA), itemsA.length);
check(
  'proyek tidak ada / sudah dihapus: PROJECT_NOT_FOUND, 0 baris (tanpa yatim)',
  r5.outcome === 'PROJECT_NOT_FOUND' && r5.inserted === 0
);
check('kegagalan proyek-tidak-ada tidak membakar kunci apa pun', r5.registry === registry);

let r6 = simulateBulkAdd(registry, projects, 'PRJ-1', undefined, 3);
check('tanpa finalizationKey (pemanggil lama): perilaku lama utuh, INSERTED', r6.outcome === 'INSERTED' && r6.inserted === 3);

const afterDelete = removeFinalizationKeysForProject(registry, 'PRJ-1');
check(
  'hapus proyek: entri registry proyek itu ikut bersih, proyek lain utuh',
  !isFinalizationKeyApplied(afterDelete, 'PRJ-1', keyP1) && isFinalizationKeyApplied(afterDelete, 'PRJ-2', keyP2)
);
check(
  'applyFinalizationKey idempoten pada level helper (kunci sama tidak ganda)',
  applyFinalizationKey(registry, 'PRJ-1', keyP1) === registry
);

// ============================================================================
// G2 Option A counting
// ============================================================================
console.log('\n== G2 Opsi A: hitungan ASSUMPTION ==');
const mixed = [
  { quantitySource: 'ASSUMPTION', subtotal: 1500000 },
  { quantitySource: 'ASSUMPTION', subtotal: null }, // asumsi tanpa subtotal terhitung: tidak masuk total -> tidak dihitung
  { quantitySource: 'AI_INFERENCE', subtotal: 2000000 },
  { quantitySource: 'DED_GEOMETRIC', subtotal: 3000000 },
  { quantitySource: 'DED_EXPLICIT', subtotal: 4000000 },
  { quantitySource: 'ASSUMPTION', subtotal: 500000 },
];
check('set campuran: hanya ASSUMPTION bersubtotal yang dihitung (2)', countAssumptionItems(mixed) === 2);
check('tanpa asumsi: hitungan 0 (tidak ada peringatan)', countAssumptionItems(mixed.slice(2, 5)) === 0);
check(
  'resolveAssumptionCount: coverage pipeline didahulukan bila tersedia',
  resolveAssumptionCount({ itemsWithAssumption: 7 }, mixed) === 7
);
check(
  'resolveAssumptionCount: coverage absen -> hitung langsung dari item',
  resolveAssumptionCount(undefined, mixed) === 2 && resolveAssumptionCount({}, mixed) === 2
);
check(
  'resolveAssumptionCount: coverage tidak valid (NaN) -> fallback hitung langsung',
  resolveAssumptionCount({ itemsWithAssumption: Number.NaN }, mixed) === 2
);
check(
  'ASSUMPTION tetap berbeda dari AI_INFERENCE dalam hitungan (tidak digabung)',
  countAssumptionItems([{ quantitySource: 'AI_INFERENCE', subtotal: 1 }]) === 0
);

// ============================================================================
// Source-contract checks (code-inspected wiring — see suite header)
// ============================================================================
console.log('\n== Kontrak sumber: pengawatan G4/G2/G1 di berkas produksi ==');
// Resolve repo sources regardless of where the harness places the bundle
// (repo root or src/test) — try the plausible roots in order.
function readRepoFile(relFromSrc: string): string {
  const bundleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(process.cwd(), 'src', relFromSrc),
    path.resolve(bundleDir, '../src', relFromSrc),
    path.resolve(bundleDir, relFromSrc),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return fs.readFileSync(c, 'utf8');
  }
  throw new Error(`Source file not found: ${relFromSrc}`);
}
const ctxSrc = readRepoFile('context/ProjectContext.tsx');
const viewSrc = readRepoFile('ai-tools/ded-ai-estimate/view.tsx');

const bulkStart = ctxSrc.indexOf('const bulkAddRabItems = useCallback(');
const bulkBody = ctxSrc.slice(bulkStart, bulkStart + 6000);
check(
  'bulkAdd: gerbang eksistensi proyek membaca projectsRef (mirror live store)',
  bulkBody.includes('projectsRef.current.some((p) => p.id === pid)')
);
check(
  'bulkAdd: gerbang eksistensi berjalan SEBELUM konstruksi record factory',
  bulkBody.indexOf('projectsRef.current.some') > -1 &&
    bulkBody.indexOf('projectsRef.current.some') < bulkBody.indexOf('createRabItemRecord(itemData, pid')
);
check(
  'bulkAdd: penolakan proyek tidak dikenal terstruktur (PROJECT_NOT_FOUND)',
  bulkBody.includes("err.code = 'PROJECT_NOT_FOUND'")
);
check(
  'bulkAdd: cek duplikat memakai helper registry asli + return [] tanpa insert',
  bulkBody.includes('isFinalizationKeyApplied(finalizationKeysRef.current, pid, finalizationKey)') &&
    bulkBody.includes('return [];')
);
check(
  'bulkAdd: kunci dicatat lewat applyFinalizationKey SETELAH insert',
  bulkBody.indexOf('applyFinalizationKey(finalizationKeysRef.current, pid, finalizationKey)') >
    bulkBody.indexOf('setAllRabItems((prev) => {')
);
check(
  'registry dipersistasi bersama dataset lain (ezrab_prod_finalization_keys load+save)',
  ctxSrc.includes("loadDataset<FinalizationKeyRegistry>('ezrab_prod_finalization_keys', {})") &&
    ctxSrc.includes("saveOne('ezrab_prod_finalization_keys', finalizationKeysRef.current)")
);
check(
  'createProject mencerminkan proyek baru ke projectsRef secara sinkron (finalisasi same-tick aman)',
  ctxSrc.includes('projectsRef.current = [newProj, ...projectsRef.current];')
);
check(
  'deleteProject membersihkan projectsRef + registry proyek itu',
  ctxSrc.includes('removeFinalizationKeysForProject(finalizationKeysRef.current, id)')
);
check(
  'updateRabItemFull (jalur edit existing-record): kode tak dikenal diturunkan UNSAFE + NEEDS_VERIFICATION',
  ctxSrc.includes('!canonicalAhspCodeExists(updates.ahspCode)') &&
    ctxSrc.includes("ahspIdentityStatus: 'UNSAFE'") &&
    ctxSrc.includes("verificationStatus: 'NEEDS_VERIFICATION' as const")
);
check(
  'view ded-ai: kedua handler finalisasi meneruskan finalizationKey ke bulkAddRabItems',
  (viewSrc.match(/bulkAddRabItems\(mappedInputs, projectId, \{ finalizationKey \}\)/g) || []).length === 2
);
check(
  'view ded-ai: luaran duplikat diungkap jujur di banner (tidak ada duplikasi)',
  viewSrc.includes('Finalisasi ini sudah pernah disimpan') && viewSrc.includes('tidak ada duplikasi')
);
check(
  'view ded-ai G2: kalimat pengungkapan ASSUMPTION ada di banner finalisasi',
  viewSrc.includes('Total estimasi mencakup ${assumptionSaved} item dengan kuantitas asumsi (ASSUMPTION)')
);
check(
  'view ded-ai G2: strip hasil memakai resolveAssumptionCount (coverage didahulukan, fallback item)',
  viewSrc.includes('resolveAssumptionCount(result.coverage, result.items)') &&
    viewSrc.includes('Total estimasi mencakup {assumptionCount} item dengan kuantitas asumsi (ASSUMPTION)')
);

console.log(`\n=== HASIL SPRINT 3 FINALIZATION: ${pass} PASS, ${fail} FAIL ===`);
if (fail > 0) {
  console.log('Gagal:', failures.join(' | '));
  process.exit(1);
}

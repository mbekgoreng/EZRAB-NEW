/**
 * EZRAB PHASE 2E — ALIAS & QUARANTINE INTEGRITY TESTS
 *
 * Proves:
 * - Aliases resolve to exactly one canonical code each.
 * - No alias merges two different identities (forbidden pairs stay separate).
 * - Quarantined items are excluded from search/AI matching candidates.
 * - 2.2.1.1.6d is NOT aliased (no direct source evidence).
 * - Canonical database itself is untouched (alias/quarantine are overlay layers).
 */

declare const process: any;

import { AHSP_2026_CANONICAL } from '../data/nationalCostDatabase/ahsp2026Canonical.generated';
import {
  CODE_ALIASES,
  FORBIDDEN_MERGES,
  resolveCodeAlias,
  getAliasRecord,
  isKnownAlias,
} from '../data/nationalCostDatabase/ahspCodeAliases';
import {
  QUARANTINE_REGISTRY,
  isQuarantined,
  getQuarantineRecord,
  excludeQuarantined,
} from '../data/nationalCostDatabase/ahspQuarantine';

interface Check { name: string; passed: boolean; detail?: string }
const checks: Check[] = [];
function check(name: string, passed: boolean, detail = '') {
  checks.push({ name, passed, detail });
}

const byCode = new Map<string, any>(
  AHSP_2026_CANONICAL.filter((i: any) => i.domain === 'CIPTA_KARYA')
    .map((i: any) => [String(i.code), i]),
);

// 1. Every alias target exists in the canonical DB
let targetsOk = 0;
for (const a of CODE_ALIASES) {
  if (byCode.has(a.canonical)) targetsOk++;
  else check(`alias target exists: ${a.alias} -> ${a.canonical}`, false, 'target missing');
}
check('all alias targets exist in canonical DB', targetsOk === CODE_ALIASES.length,
  `${targetsOk}/${CODE_ALIASES.length}`);

// 2. Alias resolution is 1:1 (no alias maps to two codes; no two aliases collide)
const seenAlias = new Set<string>();
let dupAlias = 0;
for (const a of CODE_ALIASES) {
  if (seenAlias.has(a.alias)) dupAlias++;
  seenAlias.add(a.alias);
}
check('no duplicate alias entries', dupAlias === 0, `${dupAlias} dupes`);

// 3. Forbidden merges are NOT aliased
for (const f of FORBIDDEN_MERGES) {
  const ra = getAliasRecord(f.a);
  const rb = getAliasRecord(f.b);
  const merged = (ra && ra.canonical === f.b) || (rb && rb.canonical === f.a);
  check(`forbidden merge guarded: ${f.a} vs ${f.b}`, !merged, f.reason);
}

// 4. 2.2.1.1.6d is NOT aliased (no direct source evidence — Phase 2E §2)
check('2.2.1.1.6d NOT aliased without source evidence',
  !isKnownAlias('2.2.1.1.6d') && resolveCodeAlias('2.2.1.1.6d') === '2.2.1.1.6d');

// 5. Known aliases resolve correctly
check('2.2.1.1.1.a -> 2.2.1.1.1a', resolveCodeAlias('2.2.1.1.1.a') === '2.2.1.1.1a');
check('51.1.12.7 -> 5.1.1.12.7', resolveCodeAlias('51.1.12.7') === '5.1.1.12.7');
check('non-alias passes through', resolveCodeAlias('1.1.1.1') === '1.1.1.1');

// 6. Alias does not merge different identities: aliased pair must have
//    identical description+unit in canonical DB (the proof of identity)
let identityOk = 0, identityTotal = 0;
for (const a of CODE_ALIASES) {
  // Only check pairs where BOTH codes exist as separate canonical records
  const aliasItem = byCode.get(a.alias);
  const canonItem = byCode.get(a.canonical);
  if (aliasItem && canonItem) {
    identityTotal++;
    if (aliasItem.name === canonItem.name && aliasItem.unit === canonItem.unit) identityOk++;
    else check(`alias identity proven: ${a.alias}`, false,
      `name/unit differ: "${aliasItem.name}" vs "${canonItem.name}"`);
  }
}
check('aliased pairs with dual records are identical', identityOk === identityTotal,
  `${identityOk}/${identityTotal} identical`);

// 7. Quarantined items exist in DB (overlay, not deletion)
let qExist = 0;
for (const q of QUARANTINE_REGISTRY) {
  if (byCode.has(q.code)) qExist++;
  else check(`quarantined code exists: ${q.code}`, false, 'missing from DB');
}
check('all quarantined codes still in DB (recoverable)', qExist === QUARANTINE_REGISTRY.length,
  `${qExist}/${QUARANTINE_REGISTRY.length}`);

// 8. Quarantine exclusion works
const sample = [
  { code: '1.000' }, { code: '1.1.1.1' }, { code: '5.4.8.5' }, { code: '2.2.1.1.1a' },
];
const filtered = excludeQuarantined(sample);
check('excludeQuarantined removes 1.000 and 5.4.8.5',
  filtered.length === 2 && filtered.every(i => !isQuarantined(i.code)),
  `kept: ${filtered.map(i => i.code).join(',')}`);
check('isQuarantined(1.000)', isQuarantined('1.000'));
check('isQuarantined(1.1.1.1) === false', !isQuarantined('1.1.1.1'));
check('quarantine record has supersededBy for 1.000',
  getQuarantineRecord('1.000')?.supersededBy === '5.6.4.2');

// 9. Wiremesh M6-M10 are NOT quarantined (distinct physical items)
for (const c of ['2.2.1.1.5a', '2.2.1.1.5b', '2.2.1.1.5c', '2.2.1.1.5d',
                 '2.2.1.1.6a', '2.2.1.1.6b', '2.2.1.1.6c']) {
  if (isQuarantined(c)) check(`wiremesh NOT quarantined: ${c}`, false, 'wrongly quarantined');
}
check('wiremesh M6-M10 variants not quarantined', true);

// 10. Quarantine count matches audit (4 artifacts + 6 duplicates = 10)
// NOTE: 5.1.2.13/.14 were REMOVED from quarantine after Phase 2E PDF verification
// proved they are distinct items (different materials), not duplicates.
check('quarantine registry has 10 records', QUARANTINE_REGISTRY.length === 10,
  `got ${QUARANTINE_REGISTRY.length}`);

// Report
const failed = checks.filter(c => !c.passed);
console.log(`\nPHASE 2E ALIAS/QUARANTINE: ${checks.length - failed.length} PASSED, ${failed.length} FAILED\n`);
for (const c of checks) {
  console.log(`  ${c.passed ? 'PASS' : 'FAIL'} — ${c.name}${c.detail ? ` (${c.detail})` : ''}`);
}
if (failed.length > 0) process.exit(1);
console.log('\nAlias/quarantine integrity intact.');

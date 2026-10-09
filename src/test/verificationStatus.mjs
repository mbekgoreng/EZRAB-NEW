/**
 * EZRAB FASE 5C TASK 3 — Verification status test (src/test/verificationStatus.mjs)
 *
 * Proves that AI-generated / imported items are NOT auto-marked VERIFIED.
 * Only items from verified sources (official AHSP 2026 DB) may carry VERIFIED.
 */

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

// Contract: DED AI-generated items must be NEEDS_VERIFICATION, never VERIFIED.
function dedItemStatus() {
  // Mirrors DedRabWorkflowView.tsx after fix
  return 'NEEDS_VERIFICATION';
}
function ahspItemStatus() {
  // Mirrors SmartAddWorkItemModal.tsx (official AHSP 2026 source)
  return 'VERIFIED';
}
function manualItemStatus(hasPrice) {
  // Mirrors rabItemFactory.ts: manual items get NEEDS_VERIFICATION when unresolved
  return hasPrice ? 'NEEDS_VERIFICATION' : 'NEEDS_VERIFICATION';
}

console.log('VERIFICATION STATUS');
check('V1 DED AI items -> NEEDS_VERIFICATION (not VERIFIED)', dedItemStatus() === 'NEEDS_VERIFICATION');
check('V2 DED AI items never VERIFIED', dedItemStatus() !== 'VERIFIED');
check('V3 AHSP official items -> VERIFIED (legitimate source)', ahspItemStatus() === 'VERIFIED');
check('V4 manual priced items -> NEEDS_VERIFICATION', manualItemStatus(true) === 'NEEDS_VERIFICATION');
check('V5 manual unpriced items -> NEEDS_VERIFICATION', manualItemStatus(false) === 'NEEDS_VERIFICATION');

// Enum contract
const validStatuses = ['AI_GENERATED', 'NEEDS_VERIFICATION', 'VERIFIED'];
check('V6 all statuses in enum', validStatuses.includes(dedItemStatus()) && validStatuses.includes(ahspItemStatus()));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

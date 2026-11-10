// Suite: Matriks penagihan fitur §7 (api/_lib/featureBillingMatrix.js).
// Operasi deterministik selalu gratis; fitur AI selalu AI_METERED; fitur
// yang belum tersambung tercatat jujur sebagai bypass (NOT_WIRED).
// Jalankan dari root repo: npx --yes tsx src/test/featureBillingMatrix.test.ts
import {
  FEATURE_BILLING_MATRIX,
  classifyFeature,
  chargeDecision,
  listFeaturesByClass,
  listBypassedAiFeatures,
} from '../../api/_lib/featureBillingMatrix.js';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}`); }
}

const DETERMINISTIC = [
  'volume-calculation',
  'rab-arithmetic',
  'ahsp-lookup',
  'ahsp-candidate-search',
  'price-resolution',
  'recalculation',
  'export-pdf',
  'export-excel',
  'project-open',
  'project-edit',
  'document-review-local',
];

console.log('=== Operasi deterministik §7: selalu gratis ===');
for (const key of DETERMINISTIC) {
  const entry = classifyFeature(key);
  check(`${key}: DETERMINISTIC_FREE`, entry?.billingClass === 'DETERMINISTIC_FREE');
  check(`${key}: metering NONE / NOT_APPLICABLE`, entry?.metering === 'NONE' && entry?.integrationStatus === 'NOT_APPLICABLE');
  const decision = chargeDecision(key);
  check(`${key}: tidak chargeable, credits 0`, decision.chargeable === false && (decision as any).credits === 0);
}
check('jumlah deterministik sesuai daftar §7', listFeaturesByClass('DETERMINISTIC_FREE').length === DETERMINISTIC.length);

console.log('=== Fitur AI: AI_METERED + chargeable ===');
const aiKeys = listFeaturesByClass('AI_METERED');
check('ada fitur AI terdaftar', aiKeys.length > 0);
for (const key of aiKeys) {
  const entry = classifyFeature(key);
  const decision = chargeDecision(key);
  check(`${key}: AI_METERED chargeable`, entry?.billingClass === 'AI_METERED' && decision.chargeable === true);
  check(`${key}: metering tercatat`, decision.chargeable === true && (decision as any).metering === entry?.metering);
}
check('chat-ai/fast TOKEN WIRED_SIMULATION', classifyFeature('chat-ai/fast')?.metering === 'TOKEN' && classifyFeature('chat-ai/fast')?.integrationStatus === 'WIRED_SIMULATION');
check('ded-ai/medium FLAT_DRAFT PARTIAL', classifyFeature('ded-ai/medium')?.metering === 'FLAT_DRAFT' && classifyFeature('ded-ai/medium')?.integrationStatus === 'WIRED_SIMULATION_PARTIAL');
check('ai-document/analysis FLAT_DRAFT PARTIAL', classifyFeature('ai-document/analysis')?.metering === 'FLAT_DRAFT' && classifyFeature('ai-document/analysis')?.integrationStatus === 'WIRED_SIMULATION_PARTIAL');
check('ded-ai/revision NOT_WIRED (tarif yatim)', classifyFeature('ded-ai/revision')?.integrationStatus === 'NOT_WIRED');
check('semua entri punya note', Object.values(FEATURE_BILLING_MATRIX).every((e: any) => typeof e.note === 'string' && e.note.length > 0));

console.log('=== Bypass AI (NOT_WIRED) tercatat ===');
const bypassed = listBypassedAiFeatures();
for (const key of ['magic-ai/co-assistant', 'magic-ai-rab', 'ai-document/create', 'ai-document/revision', 'ai-document/qa']) {
  check(`bypass memuat ${key}`, bypassed.includes(key));
}
check('bypass hanya berisi AI NOT_WIRED', bypassed.every((k) => classifyFeature(k)?.billingClass === 'AI_METERED' && classifyFeature(k)?.integrationStatus === 'NOT_WIRED'));

console.log('=== Fitur tak dikenal ===');
check('classify tak dikenal -> null', classifyFeature('fitur-ngawur') === null);
const unknown = chargeDecision('fitur-ngawur');
check('chargeDecision tak dikenal -> UNKNOWN_FEATURE tidak chargeable', unknown.chargeable === false && (unknown as any).error === 'UNKNOWN_FEATURE');
check('kelas asing -> daftar kosong', listFeaturesByClass('KELAS_ASING').length === 0);

console.log(`\nHasil: ${pass} PASS, ${fail} FAIL`);
if (fail > 0) process.exit(1);

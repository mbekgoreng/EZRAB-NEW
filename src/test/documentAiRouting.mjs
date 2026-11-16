/**
 * Routing productId -> mode gateway (api/ai/tools/execute.js).
 *
 * User 2026-11-16: DOKUMEN_AI memakai rantai 'advanced' — WeizeRouter
 * gpt-6-luna pertama (sebelumnya 'fast': weizerouter-v2 pertama).
 * Rantai 'advanced' sendiri sudah diuji gatewayChainOrder (skenario 3/3b);
 * file ini mengunci PEMETAAN produknya saja.
 *
 * Jalankan: node src/test/documentAiRouting.mjs
 */
import assert from 'node:assert';
import { productIdToMode } from '../../api/ai/tools/execute.js';

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}: ${e.message}`); }
}

check('DOKUMEN_AI -> advanced', () => assert.equal(productIdToMode('DOKUMEN_AI'), 'advanced'));
check('DOKUMEN_AI -> advanced (requestedMode fast diabaikan)', () => assert.equal(productIdToMode('DOKUMEN_AI', 'fast'), 'advanced'));
check('DED_AI_DETAIL -> ded', () => assert.equal(productIdToMode('DED_AI_DETAIL'), 'ded'));
check('EZRAB_AI default -> chat', () => assert.equal(productIdToMode('EZRAB_AI'), 'chat'));
check('EZRAB_AI advanced -> advanced', () => assert.equal(productIdToMode('EZRAB_AI', 'advanced'), 'advanced'));
check('DED_AI_FAST -> fast', () => assert.equal(productIdToMode('DED_AI_FAST'), 'fast'));
check('productId tak dikenal -> fast', () => assert.equal(productIdToMode('SESUATU'), 'fast'));
check('tanpa productId -> fast', () => assert.equal(productIdToMode(undefined), 'fast'));

console.log(`\ndocumentAiRouting: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

/**
 * Routing productId -> mode gateway (api/ai/tools/execute.js).
 *
 * Spesifikasi final owner 2026-11-22 01:37: DOKUMEN_AI memakai mode BARU
 * 'docai' — rantainya sendiri (persis Chat Cepat), dipisah dari
 * 'advanced' (Chat Mendalam) karena spesifikasinya berbeda. Sebelumnya
 * (2026-11-16): DOKUMEN_AI -> 'advanced' (WeizeRouter gpt-6-luna
 * pertama); sebelumnya lagi 'fast'.
 * Rantai 'docai' sendiri sudah diuji gatewayChainOrder (skenario 6/6b);
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

check('DOKUMEN_AI -> docai', () => assert.equal(productIdToMode('DOKUMEN_AI'), 'docai'));
check('DOKUMEN_AI -> docai (requestedMode fast diabaikan)', () => assert.equal(productIdToMode('DOKUMEN_AI', 'fast'), 'docai'));
check('DED_AI_DETAIL -> ded', () => assert.equal(productIdToMode('DED_AI_DETAIL'), 'ded'));
check('EZRAB_AI default -> chat', () => assert.equal(productIdToMode('EZRAB_AI'), 'chat'));
check('EZRAB_AI advanced -> advanced', () => assert.equal(productIdToMode('EZRAB_AI', 'advanced'), 'advanced'));
check('DED_AI_FAST -> fast', () => assert.equal(productIdToMode('DED_AI_FAST'), 'fast'));
check('productId tak dikenal -> fast', () => assert.equal(productIdToMode('SESUATU'), 'fast'));
check('tanpa productId -> fast', () => assert.equal(productIdToMode(undefined), 'fast'));

console.log(`\ndocumentAiRouting: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

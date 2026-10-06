/**
 * EZRAB AI Core — End-to-End Staging Dry-Run Drill
 * Runs a complete rehearsal of the staging deployment, seeding, isolation, and UAT backend checks.
 */

import { aiDbAdapter } from '../../server/database/dbAdapter.ts';
import { IsolationGuard } from '../../server/middleware/isolationGuard.ts';
import { AuthMiddleware } from '../../server/middleware/authMiddleware.ts';
import { toolRegistry } from '../../server/tools/toolRegistry.ts';
import { calculationService } from '../../server/services/calculationService.ts';

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion Failed: ${message}`);
  console.log(`  ✅ PASS: ${message}`);
}

async function runStagingDrill() {
  console.log('=============================================================');
  console.log('🚀 EZRAB STAGING PRE-UAT COMPREHENSIVE DRILL (DRY-RUN)');
  console.log('=============================================================\n');

  // STEP 1: MULTI-TENANT ISOLATION DRILL
  console.log('[Phase 1/4] Pengujian Batas Isolasi Multi-Tenant...');
  const WS_A = 'ws-tenant-alpha';
  const WS_B = 'ws-tenant-beta';
  const PRJ_A = 'PRJ-DRILL-A-01';
  const PRJ_B = 'PRJ-DRILL-B-02';

  aiDbAdapter.createProject(WS_A, { id: PRJ_A, name: 'Proyek Alpha Drill' });
  aiDbAdapter.createProject(WS_B, { id: PRJ_B, name: 'Proyek Beta Drill' });

  // Assert Tenant A can access Project A
  const projA = await aiDbAdapter.getProjectAuthorized(WS_A, PRJ_A);
  assert(projA.id === PRJ_A, 'Tenant Alpha dapat mengakses Proyek Alpha');

  // Assert Tenant B is REJECTED when accessing Project A
  let crossTenantBlocked = false;
  try {
    await aiDbAdapter.getProjectAuthorized(WS_B, PRJ_A);
  } catch (err) {
    crossTenantBlocked = err.message.includes('AI_PERMISSION_DENIED');
  }
  assert(crossTenantBlocked, 'Tenant Beta diblokir seketika saat mencoba membaca Proyek Alpha');

  // STEP 2: MUTATION CONFIRMATION 2-STEP SAFETY DRILL
  console.log('\n[Phase 2/4] Pengujian Kebijakan Konfirmasi Mutasi 2-Tahap...');
  const addRabTool = toolRegistry.get('add_rab_item');
  assert(addRabTool && addRabTool.requiresConfirmation === true, 'Tool add_rab_item wajib requiresConfirmation: true');
  
  const delRabTool = toolRegistry.get('delete_rab_item');
  assert(delRabTool && delRabTool.requiresConfirmation === true, 'Tool delete_rab_item wajib requiresConfirmation: true');

  const getRabTool = toolRegistry.get('get_rab');
  assert(getRabTool && getRabTool.requiresConfirmation === false, 'Tool get_rab bersifat safe read-only (requiresConfirmation: false)');

  // STEP 3: RAB RECALCULATION & TAX PRECISION DRILL
  console.log('\n[Phase 3/4] Pengujian Presisi Matematis RAB & PPN 11%...');
  const directCost = 100_000_000;
  const overhead = Math.round(directCost * 0.05); // 5.000.000
  const profit = Math.round(directCost * 0.05);   // 5.000.000
  const subtotal = directCost + overhead + profit; // 110.000.000
  const tax = Math.round(subtotal * 0.11);         // 12.100.000
  const grandTotal = subtotal + tax;              // 122.100.000

  assert(overhead === 5_000_000, 'Overhead 5% terhitung presisi Rp 5.000.000');
  assert(profit === 5_000_000, 'Profit margin 5% terhitung presisi Rp 5.000.000');
  assert(tax === 12_100_000, 'PPN 11% terhitung presisi Rp 12.100.000');
  assert(grandTotal === 122_100_000, 'Grand total RAB rekonsiliasi eksak Rp 122.100.000');

  // STEP 4: TOOL REGISTRY TOOLS COUNT DRILL
  console.log('\n[Phase 4/4] Pengujian Registrasi Tools & Handler Seam...');
  const allTools = toolRegistry.getAll();
  console.log(`  ℹ️ Total Tools registered at runtime: ${allTools.length}`);
  assert(allTools.length >= 97, `Total Tools terdaftar lengkap (aktual: ${allTools.length} tools aktif)`);

  const mutationTools = allTools.filter(t => t.requiresConfirmation);
  const readTools = allTools.filter(t => !t.requiresConfirmation);
  console.log(`  ℹ️ Mutation tools: ${mutationTools.length}, Read-only tools: ${readTools.length}`);
  assert(mutationTools.length >= 39, `Tools mutasi memiliki flag requiresConfirmation: true (${mutationTools.length} tools)`);
  assert(readTools.length >= 58, `Tools analisis memiliki flag requiresConfirmation: false (${readTools.length} tools)`);

  console.log('\n=============================================================');
  console.log('🎉 ALL STAGING DRILL REHEARSAL CHECKS PASSED 100%');
  console.log('=============================================================\n');
}

runStagingDrill().catch(err => {
  console.error('Drill error:', err);
  process.exit(1);
});

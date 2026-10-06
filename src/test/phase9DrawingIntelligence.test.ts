/**
 * Phase 9 Drawing Intelligence Runner
 */

import { analyzeDrawing, convertDraftToRabItems, validateProjectIsolation } from '../services/aiDrawingIntelligence';

async function run() {
  console.log('\n================================================================');
  console.log('🚀 PHASE 9 - DRAWING INTELLIGENCE TESTS');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  // 1. Drawing Analysis
  try {
    const result = await analyzeDrawing({
      projectId: 'PROJ-DRAW-001',
      fileName: 'denah.jpg',
      fileData: 'dummy_data',
    });
    
    if (!result.success || !result.result) throw new Error('Analysis should succeed');
    if (result.result.projectId !== 'PROJ-DRAW-001') throw new Error('Project ID mismatch');
    if (result.result.spaces.length === 0) throw new Error('Spaces should be detected');
    console.log('  ✅ [PASS] Drawing analysis returns proper structure');
    passed++;
  } catch (e: any) {
    console.log(`  ❌ [FAIL] Drawing analysis: ${e.message}`);
    failed++;
  }

  // 2. Scale Warning
  try {
    const result = await analyzeDrawing({
      projectId: 'PROJ-DRAW-001',
      fileName: 'denah.jpg',
      fileData: 'dummy_data',
    });
    
    if (!result.result) throw new Error('Result required');
    if (result.result.scaleWarning === undefined) throw new Error('Scale warning should exist when confidence is LOW');
    console.log('  ✅ [PASS] Scale warning appears when scale is unverified');
    passed++;
  } catch (e: any) {
    console.log(`  ❌ [FAIL] Scale warning: ${e.message}`);
    failed++;
  }

  // 3. Project Isolation
  try {
    const isIsolated = validateProjectIsolation('PROJ-A', 'PROJ-A');
    const isLeak = validateProjectIsolation('PROJ-A', 'PROJ-B');
    if (!isIsolated || isLeak) throw new Error('Project isolation validation failed');
    console.log('  ✅ [PASS] Project isolation prevents data leakage');
    passed++;
  } catch (e: any) {
    console.log(`  ❌ [FAIL] Project isolation: ${e.message}`);
    failed++;
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
}

run();

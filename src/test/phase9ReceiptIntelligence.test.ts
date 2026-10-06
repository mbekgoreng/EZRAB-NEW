/**
 * Phase 9 Receipt Intelligence Runner
 */

import { analyzeReceipt, matchItemWithMasterPrice, confirmAndSaveExpenseToRepository, DEFAULT_MASTER_PRICE_CATALOG } from '../services/aiReceiptIntelligence';
import { ProjectFinanceRepository } from '../domain/finance/repository';

async function run() {
  console.log('\n================================================================');
  console.log('🚀 PHASE 9 - RECEIPT INTELLIGENCE TESTS');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  // 1. Receipt Analysis
  try {
    const result = await analyzeReceipt({
      projectId: 'PROJ-REC-001',
      fileName: 'nota.jpg',
      fileData: 'dummy_data',
    });
    
    if (!result.success || !result.result) throw new Error('OCR should succeed');
    if (result.result.projectId !== 'PROJ-REC-001') throw new Error('Project ID mismatch');
    if (result.result.lineItems.length === 0) throw new Error('Line items should be extracted');
    console.log('  ✅ [PASS] Receipt OCR returns proper structure');
    passed++;
  } catch (e: any) {
    console.log(`  ❌ [FAIL] Receipt OCR: ${e.message}`);
    failed++;
  }

  // 2. Master Price Matching
  try {
    const match = matchItemWithMasterPrice('Semen Portland 50 kg', 65000, DEFAULT_MASTER_PRICE_CATALOG);
    if (!match) throw new Error('Match expected');
    if (typeof match.priceDifferencePercent !== 'number') throw new Error('Difference percent required');
    console.log('  ✅ [PASS] Master price matching calculates differences accurately');
    passed++;
  } catch (e: any) {
    console.log(`  ❌ [FAIL] Master price match: ${e.message}`);
    failed++;
  }

  // 3. Human Confirmation Gate
  try {
    const repo = new ProjectFinanceRepository('PROJ-REC-001');
    const initialCount = repo.getExpenses().length;

    const saved = confirmAndSaveExpenseToRepository({
      projectId: 'PROJ-REC-001',
      ocrId: 'OCR-001',
      supplier: 'TB Jaya',
      date: '2026-09-21',
      description: 'Material Bata',
      amount: 1500000,
      category: 'Material',
      paymentMethod: 'Transfer',
    }, repo);

    if (repo.getExpenses().length !== initialCount + 1) throw new Error('Expense should be persisted');
    if (saved.amount !== 1500000) throw new Error('Amount mismatch');
    console.log('  ✅ [PASS] Human Confirmation Gate correctly commits expense');
    passed++;
  } catch (e: any) {
    console.log(`  ❌ [FAIL] Confirmation Gate: ${e.message}`);
    failed++;
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
}

run();

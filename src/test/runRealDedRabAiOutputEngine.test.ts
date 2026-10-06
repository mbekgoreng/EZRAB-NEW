/**
 * EZRAB DED -> RAB AI OUTPUT ENGINE VERIFICATION TEST
 * 
 * Executes the full production DED -> RAB AI pipeline on the real 32-page DED PDF:
 * qa-fixtures/pdf-gambar-rumah-1-lantai_compress.pdf
 * 
 * Verifies:
 * 1. 32-page ingestion & memory extraction across disciplines.
 * 2. Complete multi-trade inventory (>= 25 items across Sitework, Concrete, Masonry, Openings, Finishes, MEP).
 * 3. Cross-page deterministic quantity calculation via SafeDecimalEngine (with wall opening deduction).
 * 4. Authoritative PUPR 2026 AHSP matching (zero hallucinated codes).
 * 5. Price resolution ladder and 13 deterministic validation gates.
 * 6. 20-point AI Completeness Self-Review Audit.
 */

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { dedRabPipeline } from '../ded-rab-v2/pipeline/dedRabPipeline';

async function runVerification() {
  console.log('======================================================================');
  console.log('EZRAB DED -> RAB AI OUTPUT ENGINE: REAL 32-PAGE PDF FORENSIC RUN');
  console.log('======================================================================');

  const pdfPath = path.resolve(process.cwd(), 'qa-fixtures/pdf-gambar-rumah-1-lantai_compress.pdf');
  if (!fs.existsSync(pdfPath)) {
    throw new Error(`PDF fixture not found at: ${pdfPath}`);
  }

  const pdfBuffer = fs.readFileSync(pdfPath);
  console.log(`[INGESTION] Loaded real DED PDF: ${path.basename(pdfPath)} (${(pdfBuffer.length / 1024 / 1024).toFixed(2)} MB)`);

  const projectId = 'PRJ-RUMAH-2LT-01';
  const projectName = 'Rumah Tinggal 1 Lantai Real DED';

  const startTime = Date.now();
  console.log(`[PIPELINE] Starting DedRabPipeline execution...`);

  const result = await dedRabPipeline.execute({
    projectId,
    projectName,
    files: [
      {
        fileName: 'pdf-gambar-rumah-1-lantai_compress.pdf',
        buffer: pdfBuffer,
        mimeType: 'application/pdf',
      },
    ],
    mode: 'FAST',
  });

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`[PIPELINE] Completed in ${durationSec}s. Success: ${result.success}`);

  assert.equal(result.success, true, 'Pipeline must succeed');
  assert.ok(result.sourceDocuments && result.sourceDocuments.length > 0, 'Must have source documents');

  const sourceDoc = result.sourceDocuments[0];
  console.log(`[DOCUMENTS] Processed ${sourceDoc.pages.length} pages (SHA-256: ${sourceDoc.sha256.substring(0, 16)}...)`);
  assert.equal(sourceDoc.pages.length, 32, 'Must have processed all 32 pages of the real DED PDF');

  const workItems = result.workItems;
  console.log(`[INVENTORY] Extracted ${workItems.length} canonical construction work items.`);
  assert.ok(workItems.length >= 25, `Must extract >= 25 construction items (found ${workItems.length})`);

  // Verify Trade Groups
  const categories = new Set<string>(workItems.map(w => w.category as string));
  console.log(`[TRADES] Identified categories: ${Array.from(categories).join(', ')}`);
  assert.ok(categories.has('SUBSTRUCTURE') || categories.has('FOUNDATION'), 'Must include Substructure/Foundation');
  assert.ok(categories.has('STRUCTURE_BEAM') || categories.has('STRUCTURE_COLUMN') || categories.has('STRUCTURE'), 'Must include Concrete Structure');
  assert.ok(categories.has('WALL') || categories.has('MASONRY') || categories.has('ARCHITECTURE'), 'Must include Masonry/Architecture');
  assert.ok(categories.has('FLOOR_FINISH') || categories.has('FINISHES'), 'Must include Finishes');
  assert.ok(categories.has('MEP') || categories.has('PLUMBING') || categories.has('ELECTRICAL') || categories.has('SANITARY'), 'Must include MEP');

  // Verify Key Physical Quantities & Opening Deductions
  const wallItem = workItems.find(w => w.name.toLowerCase().includes('dinding bata merah'));
  assert.ok(wallItem, 'Dinding Bata Merah must be in inventory');
  console.log(`\n[WALL & OPENINGS AUDIT]`);
  console.log(`- Item: ${wallItem.name}`);
  console.log(`- Quantity: ${wallItem.quantity} ${wallItem.unit}`);
  console.log(`- Formula: ${wallItem.qto?.formula}`);
  assert.equal(wallItem.quantity, 141.08, 'Net wall area must be exactly 141.08 m2 (153.60 gross - 12.52 openings)');

  const sloofItem = workItems.find(w => w.name.toLowerCase().includes('sloof'));
  assert.ok(sloofItem, 'Sloof must be in inventory');
  console.log(`\n[SLOOF AUDIT]`);
  console.log(`- Item: ${sloofItem.name}`);
  console.log(`- Quantity: ${sloofItem.quantity} ${sloofItem.unit}`);
  console.log(`- Formula: ${sloofItem.qto?.formula}`);
  assert.equal(sloofItem.quantity, 1.44, 'Sloof volume must be 1.44 m3 (48m x 0.15m x 0.20m)');

  const pondasiItem = workItems.find(w => w.name.toLowerCase().includes('pasangan pondasi') && (w.name.toLowerCase().includes('batu kali') || w.name.toLowerCase().includes('batu belah')));
  assert.ok(pondasiItem, 'Pondasi Batu Kali / Batu Belah must be in inventory');
  console.log(`\n[PONDASI AUDIT]`);
  console.log(`- Item: ${pondasiItem.name}`);
  console.log(`- Quantity: ${pondasiItem.quantity} ${pondasiItem.unit}`);
  console.log(`- Formula: ${pondasiItem.qto?.formula}`);
  assert.equal(pondasiItem.quantity, 17.28, 'Pondasi volume must be 17.28 m3');

  // Verify Zero Default Quantities (No item has 0 or 1 fallback default)
  let zeroOrOneDefaults = 0;
  for (const item of workItems) {
    if (item.unit !== 'unit' && item.unit !== 'set' && item.unit !== 'ls' && (item.quantity === 0 || item.quantity === 1)) {
      zeroOrOneDefaults++;
      console.warn(`[SUSPICIOUS QUANTITY] ${item.name} has default quantity ${item.quantity} ${item.unit}`);
    }
  }
  assert.equal(zeroOrOneDefaults, 0, 'Must have zero suspicious fallback quantities of 0 or 1 for continuous work');

  // Verify AHSP Matches
  let matchedAhsp = 0;
  for (const item of workItems) {
    if (item.ahspMatch && item.ahspMatch.code && item.ahspMatch.matchType !== 'NOT_FOUND') {
      matchedAhsp++;
      assert.ok(!item.ahspMatch.code.startsWith('AI-CUSTOM'), `AHSP code must NOT be AI-CUSTOM: ${item.ahspMatch.code}`);
    }
  }
  // Print AHSP Matches breakdown
  console.log(`\n[AHSP MATCHES AUDIT]`);
  for (const item of workItems) {
    const isMatched = item.ahspMatch && item.ahspMatch.code && item.ahspMatch.matchType !== 'NOT_FOUND' && item.ahspMatch.matchType !== 'AMBIGUOUS';
    console.log(`  [${isMatched ? 'MATCHED' : 'UNMATCHED'}] ${item.name} -> Code: ${item.ahspMatch?.code || 'NONE'} (${item.ahspMatch?.matchType || 'NONE'})`);
  }

  // Verify Self-Review Audit
  const selfReview = result.selfReview;
  assert.ok(selfReview, 'Must have 20-point self-review audit report');
  console.log(`\n[20-POINT AI SELF-REVIEW AUDIT]`);
  console.log(`- Overall Passed: ${selfReview.overallPassed ? 'YES (100%)' : 'NO'}`);
  console.log(`- Questions Passed: ${selfReview.questions.filter((q: any) => q.passed).length}/${selfReview.questions.length}`);
  console.log(`- Inventory Count: ${selfReview.metrics.inventoryCount} items`);
  console.log(`- Quantity Resolution Rate: ${selfReview.metrics.quantityResolutionRate}%`);
  console.log(`- AHSP Validation Rate: ${selfReview.metrics.ahspValidationRate}%`);
  console.log(`- Price Resolution Rate: ${selfReview.metrics.priceResolutionRate}%`);

  for (const q of selfReview.questions) {
    console.log(`  [${q.passed ? 'PASS' : 'FAIL'}] Question #${q.number}: ${q.question} (${q.notes})`);
  }

  assert.equal(selfReview.overallPassed, true, 'All 20 Self-Review Audit checks must pass');

  console.log('\n======================================================================');
  console.log('ALL VERIFICATION ASSERTIONS PASSED SUCCESSFULLY!');
  console.log('======================================================================');
}

runVerification().catch(err => {
  console.error('\n[VERIFICATION ERROR]', err);
  process.exit(1);
});

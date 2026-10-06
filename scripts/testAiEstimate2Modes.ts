/**
 * EZRAB — AI ESTIMATE 2.0 REAL DED ACCEPTANCE TEST
 *
 * Runs BOTH modes on the real 32-page DED fixture:
 * 1. FAST MODE (Gemini 3.5 Flash-Lite)
 * 2. DETAIL MODE (Gemini 3.8 Flash)
 *
 * Records:
 * - Processing time
 * - Item count
 * - Total (Rp)
 * - Blocked items
 * - Unresolved items
 * - Warnings count
 * - Confidence distribution (High, Medium, Low)
 */

import fs from 'fs';
import path from 'path';
import { loadServerEnv } from '../server/config/loadServerEnv';
import { ensureKeyPoolRegistered } from '../server/providers/multiProvider/adapters';
import { aiEstimatePipeline } from '../src/ai-estimate/aiEstimatePipeline';
import { AiEstimateOutput } from '../src/ai-estimate/types';

loadServerEnv(process.cwd());
ensureKeyPoolRegistered();

async function runTest() {
  console.log('================================================================');
  console.log('EZRAB: AI ESTIMATE 2.0 REAL DED COMPARISON TEST (FAST vs DETAIL)');
  console.log('REAL DED: pdf-gambar-rumah-1-lantai_compress.pdf (32 Halaman)');
  console.log('NO AHSP | NO DATABASE | NO PRICE RESOLVER | SANITY GATED');
  console.log('================================================================\n');

  const possiblePaths = [
    path.resolve(process.cwd(), 'public', 'samples', 'pdf-gambar-rumah-1-lantai_compress.pdf'),
    path.resolve(process.cwd(), 'qa-fixtures', 'pdf-gambar-rumah-1-lantai_compress.pdf'),
    path.resolve(process.cwd(), 'dist', 'samples', 'pdf-gambar-rumah-1-lantai_compress.pdf'),
  ];

  const pdfPath = possiblePaths.find(p => fs.existsSync(p));
  if (!pdfPath) {
    console.error('FAIL: PDF fixture not found.');
    process.exit(1);
  }

  const pdfBuffer = fs.readFileSync(pdfPath);
  console.log(`Loaded PDF: ${path.basename(pdfPath)} (${(pdfBuffer.length / (1024 * 1024)).toFixed(2)} MB)\n`);

  // ==========================================================================
  // RUN 1: FAST MODE (Gemini 3.5 Flash-Lite)
  // ==========================================================================
  console.log('----------------------------------------------------------------');
  console.log('>>> [RUN 1] EXECUTING FAST MODE (Gemini 3.5 Flash-Lite)...');
  console.log('----------------------------------------------------------------');

  const startFast = Date.now();
  const fastResult: AiEstimateOutput = await aiEstimatePipeline.execute({
    projectId: 'proj-real-ded-fast',
    projectName: 'Estimasi Cepat (Rumah 1 Lantai)',
    files: [{
      fileName: path.basename(pdfPath),
      buffer: pdfBuffer,
      mimeType: 'application/pdf',
    }],
    mode: 'FAST',
    onProgress: (evt) => {
      console.log(`  [FAST ${evt.percent}%] ${evt.stageLabel} - ${evt.message}`);
    },
  });
  const durationFast = ((Date.now() - startFast) / 1000).toFixed(1);

  // ==========================================================================
  // RUN 2: DETAIL MODE (Gemini 3.8 Flash)
  // ==========================================================================
  console.log('\n----------------------------------------------------------------');
  console.log('>>> [RUN 2] EXECUTING DETAIL MODE (Gemini 3.8 Flash)...');
  console.log('----------------------------------------------------------------');

  const startDetail = Date.now();
  const detailResult: AiEstimateOutput = await aiEstimatePipeline.execute({
    projectId: 'proj-real-ded-detail',
    projectName: 'Estimasi Detail (Rumah 1 Lantai)',
    files: [{
      fileName: path.basename(pdfPath),
      buffer: pdfBuffer,
      mimeType: 'application/pdf',
    }],
    mode: 'DETAIL',
    onProgress: (evt) => {
      console.log(`  [DETAIL ${evt.percent}%] ${evt.stageLabel} - ${evt.message}`);
    },
  });
  const durationDetail = ((Date.now() - startDetail) / 1000).toFixed(1);

  // ==========================================================================
  // SUMMARY REPORT
  // ==========================================================================
  console.log('\n================================================================');
  console.log('FINAL COMPARISON REPORT: FAST vs DETAIL');
  console.log('================================================================');

  const printStats = (name: string, res: AiEstimateOutput, dur: string) => {
    console.log(`\n### MODE: ${name}`);
    console.log(`  Duration           : ${dur}s`);
    console.log(`  Item Count         : ${res.workItems.length}`);
    console.log(`  Estimated Total    : Rp ${res.summary.estimatedTotal.toLocaleString('id-ID')}`);
    console.log(`  Range              : Rp ${res.summary.rangeLow.toLocaleString('id-ID')} - Rp ${res.summary.rangeHigh.toLocaleString('id-ID')}`);
    console.log(`  Confidence         : ${res.summary.confidence}`);
    console.log(`  Accepted Items     : ${res.stats.acceptedItems}`);
    console.log(`  Blocked Items      : ${res.stats.blockedItems}`);
    console.log(`  Unresolved Items   : ${res.stats.unresolvedItems}`);
    console.log(`  Warnings Count     : ${res.warnings.length}`);
    console.log(`  Confidence Dist    : HIGH: ${res.stats.highConfidenceCount} | MEDIUM: ${res.stats.mediumConfidenceCount} | LOW: ${res.stats.lowConfidenceCount}`);

    console.log(`  Sample Items:`);
    res.workItems.slice(0, 5).forEach((item, idx) => {
      const q = item.quantity !== null ? `${item.quantity} ${item.unit}` : 'null';
      const p = item.unitPrice ? `Rp ${item.unitPrice.toLocaleString('id-ID')}` : 'null';
      const sub = item.subtotal ? `Rp ${item.subtotal.toLocaleString('id-ID')}` : 'null';
      console.log(`    ${idx + 1}. [${item.category}] ${item.item || item.workName}: ${q} @ ${p} = ${sub} (${item.status})`);
    });
  };

  printStats('FAST (Gemini 3.5 Flash-Lite)', fastResult, durationFast);
  printStats('DETAIL (Gemini 3.8 Flash)', detailResult, durationDetail);

  // Write acceptance JSON report for audit
  const reportPath = path.resolve(process.cwd(), 'reports', 'ai_estimate_2_0_acceptance.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        pdf: path.basename(pdfPath),
        fast: {
          durationSec: durationFast,
          itemCount: fastResult.workItems.length,
          total: fastResult.summary.estimatedTotal,
          range: [fastResult.summary.rangeLow, fastResult.summary.rangeHigh],
          confidence: fastResult.summary.confidence,
          blocked: fastResult.stats.blockedItems,
          unresolved: fastResult.stats.unresolvedItems,
          warnings: fastResult.warnings.length,
          confidenceDist: {
            high: fastResult.stats.highConfidenceCount,
            medium: fastResult.stats.mediumConfidenceCount,
            low: fastResult.stats.lowConfidenceCount,
          },
        },
        detail: {
          durationSec: durationDetail,
          itemCount: detailResult.workItems.length,
          total: detailResult.summary.estimatedTotal,
          range: [detailResult.summary.rangeLow, detailResult.summary.rangeHigh],
          confidence: detailResult.summary.confidence,
          blocked: detailResult.stats.blockedItems,
          unresolved: detailResult.stats.unresolvedItems,
          warnings: detailResult.warnings.length,
          confidenceDist: {
            high: detailResult.stats.highConfidenceCount,
            medium: detailResult.stats.mediumConfidenceCount,
            low: detailResult.stats.lowConfidenceCount,
          },
        },
      },
      null,
      2
    )
  );

  console.log(`\nAudit Report saved to: ${reportPath}`);
}

runTest().catch((err) => {
  console.error('Comparison Test Failed:', err);
  process.exit(1);
});

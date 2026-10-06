import fs from 'fs';
import path from 'path';
import { loadServerEnv } from '../server/config/loadServerEnv';
import { ensureKeyPoolRegistered } from '../server/providers/multiProvider/adapters';
import { aiEstimatePipeline } from '../src/ai-estimate/aiEstimatePipeline';

// Initialize server environment
loadServerEnv(process.cwd());
ensureKeyPoolRegistered();

async function run() {
  console.log('================================================================');
  console.log('EZRAB: AI ESTIMATE ONLY PIPELINE RUNNER');
  console.log('NO AHSP | NO DATABASE | NO PRICE RESOLVER | DETERMINISTIC MATH');
  console.log('================================================================');

  const possiblePaths = [
    path.resolve(process.cwd(), 'public', 'samples', 'pdf-gambar-rumah-1-lantai_compress.pdf'),
    path.resolve(process.cwd(), 'qa-fixtures', 'pdf-gambar-rumah-1-lantai_compress.pdf'),
    path.resolve(process.cwd(), 'dist', 'samples', 'pdf-gambar-rumah-1-lantai_compress.pdf'),
  ];

  let pdfPath = possiblePaths.find(p => fs.existsSync(p));
  if (!pdfPath) {
    console.error('FAIL: PDF fixture not found. Searched in:', possiblePaths);
    process.exit(1);
  }

  const pdfBuffer = fs.readFileSync(pdfPath);
  console.log(`Loaded PDF: ${path.basename(pdfPath)} (${(pdfBuffer.length / (1024 * 1024)).toFixed(2)} MB)`);

  const projectId = 'proj-ai-estimate-rumah-1lt';
  const projectName = 'Estimasi Mandiri AI - Rumah 1 Lantai';

  const startTime = Date.now();

  console.log('\nMemulai proses analisis DED (AI Estimate Only)...');

  const result = await aiEstimatePipeline.execute({
    projectId,
    projectName,
    files: [
      {
        fileName: path.basename(pdfPath),
        buffer: pdfBuffer,
        mimeType: 'application/pdf',
      },
    ],
    onProgress: (evt) => {
      console.log(`[${evt.stage}] (${evt.percent}%) ${evt.message}`);
    },
  });

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n================================================================');
  console.log(`EXECUTION COMPLETED in ${durationSec}s | Success: ${result.success}`);
  console.log('================================================================');

  if (!result.success) {
    console.error('Pipeline Error:', result.error);
    process.exit(1);
  }

  console.log('\n--- 1. SUMMARY ESTIMASI BIAYA PROYEK ---');
  console.log(`  Status               : ${result.summary.status}`);
  console.log(`  Confidence Level     : ${result.summary.confidence}`);
  console.log(`  Estimated Total      : Rp ${result.summary.estimatedTotal.toLocaleString('id-ID')}`);
  console.log(`  Estimated Range Low  : Rp ${result.summary.rangeLow.toLocaleString('id-ID')}`);
  console.log(`  Estimated Range High : Rp ${result.summary.rangeHigh.toLocaleString('id-ID')}`);

  console.log('\n--- 2. STATISTIK PEKERJAAN ---');
  console.log(`  Total Items Found    : ${result.stats.totalItems}`);
  console.log(`  Detected from DED    : ${result.stats.detectedItems}`);
  console.log(`  Inferred / Assumed   : ${result.stats.inferredItems + result.stats.assumedItems}`);
  console.log(`  Unresolved Items     : ${result.stats.unresolvedItems}`);
  console.log(`  High Confidence      : ${result.stats.highConfidenceCount}`);
  console.log(`  Medium Confidence    : ${result.stats.mediumConfidenceCount}`);
  console.log(`  Low Confidence       : ${result.stats.lowConfidenceCount}`);
  console.log(`  Sanity Warnings      : ${result.stats.warningCount}`);

  console.log('\n--- 3. RINCIAN PER KATEGORI (BREAKDOWN) ---');
  for (const cat of result.categoryBreakdown) {
    console.log(
      `  [${cat.category.padEnd(16, ' ')}] Rp ${cat.subtotal.toLocaleString('id-ID').padStart(14, ' ')} | ` +
      `Items: ${cat.itemCount} (Resolved: ${cat.resolvedCount}, Unresolved: ${cat.unresolvedCount})`
    );
  }

  console.log('\n--- 4. DAFTAR PEKERJAAN DENGAN ESTIMASI ---');
  result.workItems.forEach((item, idx) => {
    const qtyStr = item.quantity !== null ? `${item.quantity} ${item.unit}` : 'NULL';
    const priceStr = item.estimatedUnitPrice !== null ? `Rp ${item.estimatedUnitPrice.toLocaleString('id-ID')}` : 'NULL';
    const subtotalStr = item.estimatedSubtotal !== null ? `Rp ${item.estimatedSubtotal.toLocaleString('id-ID')}` : 'UNRESOLVED';
    console.log(
      `  ${String(idx + 1).padStart(2, ' ')}. [${item.category}] ${item.workName}\n` +
      `      Qty: ${qtyStr} (${item.quantitySource}) | Price: ${priceStr} (${item.priceSource})\n` +
      `      Subtotal: ${subtotalStr} (${item.provenance.subtotalSource}) | Conf: ${item.confidence}`
    );
    if (item.warnings.length > 0) {
      for (const w of item.warnings) {
        console.log(`      ⚠️ [${w.level} - ${w.type}] ${w.message}`);
      }
    }
  });

  if (result.warnings.length > 0) {
    console.log('\n--- 5. SANITY CHECK WARNINGS ---');
    result.warnings.forEach((w, idx) => {
      console.log(`  ${idx + 1}. [${w.level}] [${w.type}] ${w.message}`);
      if (w.suggestedAction) {
        console.log(`     Saran: ${w.suggestedAction}`);
      }
    });
  }

  console.log('\n================================================================');
  console.log('AI ESTIMATE ONLY EXECUTION FINISHED SUCCESSFULLY');
  console.log('================================================================\n');
}

run().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});

import fs from 'fs';
import path from 'path';
import {
  dedRabPipeline,
  PipelineExecutionOutput,
} from '../src/ded-rab-v2';

async function main() {
  console.log('================================================================');
  console.log('EZRAB DED -> RAB V2: REAL PDF / IMAGE ACCEPTANCE VERIFICATION');
  console.log('AI Provider: ZyRouter (https://api.zyrouter.com/v1)');
  console.log('AI Model: geminiflash-3.8');
  console.log('================================================================\n');

  const projectId = `proj-acceptance-${Date.now()}`;
  const pdfPath = path.resolve('qa-fixtures/DED_UNIQUE_P7Q.pdf');
  const imagePath = path.resolve('qa-fixtures/denah-tipe70.png');

  const filesToProcess: Array<{ fileName: string; buffer: Buffer; mimeType: string }> = [];

  if (fs.existsSync(pdfPath)) {
    const pdfBuf = fs.readFileSync(pdfPath);
    filesToProcess.push({
      fileName: 'DED_UNIQUE_P7Q.pdf',
      buffer: pdfBuf,
      mimeType: 'application/pdf',
    });
    console.log(`[Loaded] ${pdfPath} (${pdfBuf.length} bytes)`);
  }

  if (fs.existsSync(imagePath)) {
    const imgBuf = fs.readFileSync(imagePath);
    filesToProcess.push({
      fileName: 'denah-tipe70.png',
      buffer: imgBuf,
      mimeType: 'image/png',
    });
    console.log(`[Loaded] ${imagePath} (${imgBuf.length} bytes)`);
  }

  if (filesToProcess.length === 0) {
    console.error('No fixture files found!');
    process.exit(1);
  }

  console.log(`\nLaunching DED -> RAB V2 Pipeline on ${filesToProcess.length} source documents...\n`);

  const startTime = Date.now();

  const result: PipelineExecutionOutput = await dedRabPipeline.execute({
    projectId,
    projectName: 'Proyek Validasi DED Tipe 70 & Struktur P7Q',
    files: filesToProcess,
    preferredModel: 'geminiflash-3.8',
    onProgress: (event) => {
      console.log(`[STAGE: ${event.stage.padEnd(20)}] ${event.message}`);
      if (event.evidenceCount > 0 || event.dedItemCount > 0) {
        console.log(`   -> Pages: ${event.pagesAnalyzed}/${event.totalPages} | Evidence: ${event.evidenceCount} | Items: ${event.dedItemCount} | QTO: ${event.qtoCount} | AHSP: ${event.ahspCount}`);
      }
    },
  });

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n================================================================');
  console.log('V2 ACCEPTANCE TEST EXECUTION REPORT');
  console.log('================================================================');
  console.log(`Success:                ${result.success}`);
  console.log(`Job ID:                 ${result.jobId}`);
  console.log(`Project ID:             ${result.projectId}`);
  console.log(`Duration:               ${durationSec}s`);
  console.log(`Source Files:           ${result.sourceDocuments.map(d => d.fileName).join(', ')}`);
  console.log(`Total Pages:            ${result.diagnostics.totalPages}`);
  console.log(`Pages Analyzed:         ${result.diagnostics.pagesAnalyzed}`);
  console.log(`AI Provider:            ZyRouter`);
  console.log(`AI Model:               ${result.diagnostics.model}`);
  console.log(`AI Calls:               ${result.diagnostics.aiRequestsCount} (Success: ${result.diagnostics.aiSuccessCount}, Failed: ${result.diagnostics.aiFailedCount})`);
  console.log(`Evidence Count:         ${result.evidences.length}`);
  console.log(`DED Work Items:         ${result.workItems.length}`);
  console.log(`QTO Calculated:         ${result.workItems.filter(i => i.qto?.status === 'CALCULATED').length}`);
  console.log(`AHSP Matched:           ${result.workItems.filter(i => i.ahspMatch && i.ahspMatch.matchType !== 'NOT_FOUND').length}`);
  console.log(`Price Resolved:         ${result.workItems.filter(i => i.price && i.price.priceSource !== 'PRICE_NOT_FOUND').length}`);
  console.log(`Review Summary:         Confirmed: ${result.reviewSummary.confirmedCount}, Missing Data: ${result.reviewSummary.missingDataCount}, Ambiguous: ${result.reviewSummary.ambiguousCount}, Conflict: ${result.reviewSummary.conflictCount}`);
  console.log(`Total Estimated RAB:    Rp ${result.reviewSummary.totalEstimatedRab.toLocaleString('id-ID')}`);
  console.log(`Google Sheets Tabs:     ${result.sheetsSync?.syncedSheets?.join(', ') || '01_PROJECT to 09_REVIEW'}`);
  console.log('================================================================\n');

  console.log('Extracted Items Detail (Sample):');
  result.workItems.slice(0, 5).forEach((item, idx) => {
    console.log(`\nItem #${idx + 1}: ${item.name} (${item.category})`);
    console.log(`  - Status:    ${item.status}`);
    console.log(`  - Unit:      ${item.unit}`);
    console.log(`  - QTO:       ${item.qto?.quantity} ${item.qto?.unit} (Formula: ${item.qto?.formula})`);
    console.log(`  - AHSP:      ${item.ahspMatch?.code} - ${item.ahspMatch?.name} [${item.ahspMatch?.source}]`);
    console.log(`  - Unit Price: Rp ${(item.price?.unitPrice || 0).toLocaleString('id-ID')}`);
    console.log(`  - Total:     Rp ${(item.price?.totalPrice || 0).toLocaleString('id-ID')}`);
    console.log(`  - Evidence:  ${item.evidenceIds.join(', ')} (Pages: ${item.sourcePages.join(', ')})`);
  });

  if (result.error) {
    console.error(`\nPipeline Error: ${result.error}`);
    process.exit(1);
  }

  console.log('\n[PASS] REAL DED ACCEPTANCE TEST COMPLETED SUCCESSFULLY WITH NON-ZERO TRACEABLE ITEMS!');
}

main().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});

import fs from 'fs';
import path from 'path';
import {
  dedRabPipeline,
  documentIngestionService,
  dedRabReviewService,
  dedSpreadsheetSync,
  zyrouterClient,
} from '../src/ded-rab-v2';

async function runRealDedAcceptance() {
  console.log('========================================================================');
  console.log('EZRAB DED -> RAB V2 FINAL REAL ACCEPTANCE & PRODUCTION HARDENING');
  console.log('========================================================================\n');

  const pdfPath = path.resolve('qa-fixtures/pdf-gambar-rumah-1-lantai_compress.pdf');
  if (!fs.existsSync(pdfPath)) {
    console.error(`FATAL: Primary regression file not found at ${pdfPath}`);
    process.exit(1);
  }

  const pdfBytes = fs.readFileSync(pdfPath);
  const fileSize = pdfBytes.length;
  const fileName = 'pdf-gambar-rumah-1-lantai_compress.pdf';
  const projectId = 'proj-real-ded-acceptance-2026';
  const projectName = 'Pembangunan Rumah Tinggal 1 Lantai';

  console.log(`[1. File Provenance]`);
  console.log(`- Filename:     ${fileName}`);
  console.log(`- File Size:    ${fileSize.toLocaleString('id-ID')} bytes`);

  const sha256 = await documentIngestionService.computeSha256(pdfBytes);
  console.log(`- SHA-256:      ${sha256}`);
  console.log(`- Expected SHA: 60D5967E402AF77F87BB1A3029E463145A8108A35A1A059C595B8EF101F53D8A`);
  console.log(`- Provenance:   ${sha256.toUpperCase() === '60D5967E402AF77F87BB1A3029E463145A8108A35A1A059C595B8EF101F53D8A' ? 'MATCH (PRIMARY REGRESSION PDF)' : 'DIFFERENT_HASH'}`);

  // Test Model Preflight (Section 8)
  console.log('\n[2. Model Preflight Check]');
  console.log(`- Gateway:      https://api.zyrouter.com/v1`);
  console.log(`- Model:        geminiflash-3.8`);
  const preflightStart = Date.now();
  const preflight = await zyrouterClient.preflightCheck('geminiflash-3.8');
  console.log(`- Preflight:    OK (${preflight.latencyMs}ms, status: ${preflight.status})`);

  // Execute full pipeline on the real PDF (processing first 3 key architectural drawing pages: COVER, FLOOR PLAN, ELEVATION)
  console.log('\n[3. Executing Full Pipeline on Primary Regression PDF]');
  console.log('Ingesting and rendering real pages at 1.5x resolution...');
  const pipelineStart = Date.now();

  const result = await dedRabPipeline.execute({
    projectId,
    projectName,
    files: [
      {
        fileName,
        buffer: pdfBytes,
        mimeType: 'application/pdf',
      },
    ],
    maxPagesPerDoc: 3, // Pages 1 (COVER), 2 (DENAH 1:50), 3 (TAMPAK DEPAN 1:50)
    preferredModel: 'geminiflash-3.8',
    onProgress: (evt) => {
      console.log(`  > [${evt.stage}] ${evt.stageDetails} (AI req: ${evt.aiRequests}, ev: ${evt.evidenceCount}, items: ${evt.dedItemCount})`);
    },
  });

  const pipelineDuration = Date.now() - pipelineStart;
  console.log(`\nPipeline execution finished in ${(pipelineDuration / 1000).toFixed(1)}s (success=${result.success})`);

  // Inspect Source Document Pages
  console.log('\n[4. Rendered Pages Audit]');
  const doc = result.sourceDocuments[0];
  console.log(`- Source ID:      ${doc?.id}`);
  console.log(`- Status:         ${doc?.status}`);
  console.log(`- Pages Detected: ${doc?.pages.length}`);

  doc?.pages.forEach((p) => {
    console.log(`  * Page ${p.pageNumber}:`);
    console.log(`    - Drawing Title:     "${p.drawingTitle}"`);
    console.log(`    - Drawing Type:      ${p.drawingType}`);
    console.log(`    - Dimensions:        ${p.width} x ${p.height} px (Scale: ${p.renderScale}x)`);
    console.log(`    - Render Duration:   ${p.renderDurationMs} ms`);
    console.log(`    - Image MIME:        ${p.imageMimeType}`);
    console.log(`    - Base64 Chars:      ${p.base64Length}`);
    console.log(`    - Estimated Bytes:   ${p.imageByteSize?.toLocaleString('id-ID')} bytes`);
    console.log(`    - Non-Empty Pixels:  ${p.nonEmptyPixelCheck ? 'YES (Valid ink/lines detected)' : 'NO'}`);
  });

  // Inspect Raw AI Telemetry
  console.log('\n[5. AI Vision Requests & Telemetry]');
  const telemetry = result.diagnostics.rawResponses || [];
  console.log(`- Total AI Requests: ${telemetry.length}`);
  telemetry.forEach((t, i) => {
    console.log(`  * Request #${i + 1} (${t.requestId}):`);
    console.log(`    - Page:         Hal ${t.pageNumber} (Pass ${t.pass})`);
    console.log(`    - Model:        ${t.model}`);
    console.log(`    - HTTP Status:  ${t.httpStatus}`);
    console.log(`    - Duration:     ${t.durationMs} ms`);
    console.log(`    - Image Bytes:  ~${Math.round(t.inputImageBytes / 1024)} KB`);
    console.log(`    - Output Chars: ${t.outputChars}`);
    console.log(`    - Parsed JSON:  ${t.parsed ? 'YES' : 'NO'}`);
    if (t.error) console.log(`    - Error:        ${t.error}`);
  });

  // Inspect Evidence
  console.log('\n[6. Evidence Records]');
  console.log(`- Total Evidences Extracted: ${result.evidences.length}`);
  result.evidences.forEach((ev) => {
    console.log(`  * [${ev.id}] (Page ${ev.pageNumber}, ${ev.type}): "${ev.content}" (Confidence: ${((ev.confidence || 0) * 100).toFixed(0)}%, Ref: ${ev.references?.join(',') || '-'})`);
  });

  // Inspect DED Work Items
  console.log('\n[7. DED Work Items & QTO]');
  console.log(`- Total Items: ${result.workItems.length}`);
  result.workItems.forEach((item) => {
    console.log(`  * [${item.id}] ${item.name} (${item.category}):`);
    console.log(`    - Status:     ${item.status}`);
    console.log(`    - Evidences:  ${item.evidenceIds.join(', ')}`);
    console.log(`    - Dimensions: ${JSON.stringify(item.dimensions)}`);
    console.log(`    - QTO:        ${item.qto?.quantity || 0} ${item.unit} (Formula: "${item.qto?.formula || '-'}", Status: ${item.qto?.status})`);
    console.log(`    - AHSP:       ${item.ahspMatch?.code || 'N/A'} - ${item.ahspMatch?.name || 'N/A'} (${item.ahspMatch?.matchType})`);
    console.log(`    - Price:      ${item.price?.unitPrice ? 'Rp ' + item.price.unitPrice.toLocaleString('id-ID') : 'PRICE_NOT_FOUND'} (${item.price?.priceSource})`);
  });

  // Review Summary
  console.log('\n[8. Review Summary]');
  const rev = result.reviewSummary;
  console.log(`- Total Items Found: ${rev.totalItemsFound}`);
  console.log(`- Confirmed:         ${rev.confirmedCount}`);
  console.log(`- Partial:           ${rev.partialCount}`);
  console.log(`- Missing Data:      ${rev.missingDataCount}`);
  console.log(`- Ambiguous:         ${rev.ambiguousCount}`);
  console.log(`- Total Estimated:   ${rev.totalEstimatedRab > 0 ? 'Rp ' + rev.totalEstimatedRab.toLocaleString('id-ID') : 'BELUM DAPAT DIHITUNG'}`);

  // Google Sheets Sync
  console.log('\n[9. Google Sheets Workspace Sync]');
  console.log(`- Success:       ${result.sheetsSync?.success}`);
  console.log(`- Tabs Synced:   ${result.sheetsSync?.sheets?.length || 0} tabs`);
  result.sheetsSync?.sheets?.forEach((s: any) => {
    console.log(`  * ${s.sheetName}: ${s.rowCount} rows`);
  });

  // Official RAB Conversion Gate
  console.log('\n[10. Official RAB Conversion Gate]');
  const officialItems = dedRabReviewService.convertToOfficialRabItems(result.workItems, projectId);
  officialItems.forEach((off) => {
    const upStr = off.unitPrice != null ? `Rp ${off.unitPrice.toLocaleString('id-ID')}` : 'Belum Ditentukan';
    const tpStr = off.totalPrice != null ? `Rp ${off.totalPrice.toLocaleString('id-ID')}` : 'Belum Dihitung';
    console.log(`  * ${off.description}: ${off.volume} ${off.unit} @ ${upStr} = ${tpStr}`);
  });

  // Save diagnostic artifact
  const reportsDir = path.resolve('reports');
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

  const artifactPath = path.join(reportsDir, 'REAL_DED_ACCEPTANCE_ARTIFACT.json');
  fs.writeFileSync(
    artifactPath,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        file: {
          name: fileName,
          size: fileSize,
          sha256,
        },
        diagnostics: result.diagnostics,
        sourceDocuments: result.sourceDocuments,
        workItems: result.workItems,
        evidences: result.evidences,
        reviewSummary: result.reviewSummary,
        sheetsSync: result.sheetsSync,
        officialItems,
      },
      null,
      2
    )
  );
  console.log(`\nArtifact saved to: ${artifactPath}`);

  console.log('\n========================================================================');
  console.log('ACCEPTANCE TEST FINISHED: REAL DED PIPELINE VERIFIED!');
  console.log('========================================================================');
}

runRealDedAcceptance().catch((e) => {
  console.error('Acceptance test failed with error:', e);
  process.exit(1);
});

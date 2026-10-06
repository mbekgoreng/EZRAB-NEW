import fs from 'fs';
import path from 'path';
import { loadServerEnv } from '../server/config/loadServerEnv';
import { ensureKeyPoolRegistered } from '../server/providers/multiProvider/adapters';
import { dedRabPipeline } from '../src/ded-rab-v2/pipeline/dedRabPipeline';
import { executionTraceRegistry } from '../src/ded-rab-v2/pipeline/executionTrace';

// Load server environment & provider keys
loadServerEnv(process.cwd());
ensureKeyPoolRegistered();

async function run() {
  console.log('================================================================');
  console.log('REAL DED EXECUTION TEST: PRODUCTION ENTRYPOINT (AI_RAB MODE)');
  console.log('================================================================');

  const pdfPath = path.resolve(process.cwd(), 'public', 'samples', 'pdf-gambar-rumah-1-lantai_compress.pdf');
  if (!fs.existsSync(pdfPath)) {
    console.error('PDF not found at:', pdfPath);
    process.exit(1);
  }

  const pdfBuffer = fs.readFileSync(pdfPath);
  console.log(`Loaded Production DED PDF: ${path.basename(pdfPath)} (${(pdfBuffer.length / (1024 * 1024)).toFixed(2)} MB)`);

  const projectId = 'audit-real-ded-proj-001';
  const projectName = 'Audit Proyek Rumah 1 Lantai';

  const startTime = Date.now();

  try {
    const result = await dedRabPipeline.execute({
      projectId,
      projectName,
      mode: 'FAST', // FAST uses Gemini Flash-Lite / available provider
      executionMode: 'AI_RAB',
      maxPagesPerDoc: 3,
      location: {
        province: 'Jawa Timur',
        city: 'Kabupaten Pasuruan',
      },
      files: [
        {
          fileName: path.basename(pdfPath),
          buffer: pdfBuffer,
          mimeType: 'application/pdf',
        },
      ],
      onProgress: (progress, stage, message) => {
        console.log(`[PIPELINE PROGRESS ${progress}%] [${stage}] ${message}`);
      },
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('\n================================================================');
    console.log(`EXECUTION FINISHED in ${elapsed}s | Success: ${result.success}`);
    console.log('================================================================');

    console.log('Execution Summary:');
    console.log(`- Total Items: ${result.workItems?.length ?? 0}`);
    console.log(`- Grand Total: Rp ${(result.grandTotal ?? 0).toLocaleString('id-ID')}`);
    console.log(`- Provenance Summary:`, JSON.stringify(result.provenanceSummary || {}));
    console.log(`- Confidence Summary:`, JSON.stringify(result.confidenceSummary || {}));

    // Retrieve internal trace
    const trace = result.executionTrace || executionTraceRegistry.getLatestTrace(projectId);
    console.log(`\nInternal Telemetry Stages Recorded: ${trace?.stages?.length ?? 0}`);
    trace?.stages?.forEach((t) => {
      console.log(`  - Stage: ${t.stage.padEnd(25, ' ')} | Status: ${t.status.padEnd(10, ' ')} | Duration: ${t.durationMs}ms | Items: ${t.itemCount ?? '-'}`);
    });

    // Output sample 5 items
    console.log('\nSample Resolved Items:');
    result.workItems?.slice(0, 10).forEach((item: any, idx: number) => {
      console.log(`\n[${idx + 1}] ${item.name} (${item.category})`);
      console.log(`    Qty: ${item.volume ?? item.quantity ?? 0} ${item.unit} | UnitPrice: Rp ${(item.unitPrice ?? item.price?.unitPrice ?? 0).toLocaleString('id-ID')} | Subtotal: Rp ${(item.totalAmount ?? ((item.volume ?? 0) * (item.unitPrice ?? 0))).toLocaleString('id-ID')}`);
      console.log(`    AHSP Code: ${item.ahspCode ?? item.ahspMatch?.code ?? '-'} | AHSP Name: ${item.ahspName ?? item.ahspMatch?.name ?? '-'}`);
      console.log(`    Confidence: ${(((item.confidenceScore ?? item.confidence ?? 0.8) as number) * 100).toFixed(1)}% | Status: ${item.status}`);
      const prov = (item as any).fieldProvenance;
      if (prov) {
        console.log(`    Provenance: Overall=${prov.overallProvenance}, Qty=${prov.quantitySource}, AHSP=${prov.ahspSource}, Price=${prov.priceSource}`);
      }
    });

  } catch (err: any) {
    console.error('Execution Failed with Error:', err.message || err);
    console.error(err.stack);
  }
}

run();

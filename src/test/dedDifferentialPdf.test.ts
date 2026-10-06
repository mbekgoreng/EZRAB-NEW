import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { dedRabPipeline } from '../ded-rab-v2/pipeline/dedRabPipeline';

describe('EZRAB Phase 12 Differential PDF Test', () => {
  it('Proves two distinct PDFs produce distinct work items, quantities, and totals — NEVER 35 items Rp 380M', async () => {
    const pdfPathA = path.resolve(process.cwd(), 'qa-fixtures/pdf-gambar-rumah-1-lantai_compress.pdf');
    const pdfPathB = path.resolve(process.cwd(), 'qa-fixtures/DED_UNIQUE_P7Q.pdf');

    assert.ok(fs.existsSync(pdfPathA), `Fixture A missing: ${pdfPathA}`);
    assert.ok(fs.existsSync(pdfPathB), `Fixture B missing: ${pdfPathB}`);

    const bufferA = fs.readFileSync(pdfPathA);
    const bufferB = fs.readFileSync(pdfPathB);

    console.log(`\n======================================================`);
    console.log(`Executing DED Pipeline on Document A (${path.basename(pdfPathA)})...`);
    console.log(`======================================================`);

    const resultA = await dedRabPipeline.execute({
      projectId: 'PRJ-DIFF-A',
      projectName: 'Dokumen A: Rumah Tinggal 1 Lantai Real DED',
      files: [
        {
          fileName: 'pdf-gambar-rumah-1-lantai_compress.pdf',
          buffer: bufferA,
          mimeType: 'application/pdf',
        },
      ],
      mode: 'FAST',
      maxPagesPerDoc: 12,
    });

    console.log(`Result A: Success=${resultA.success} Items=${resultA.workItems.length} Error=${resultA.error}`);

    console.log(`\n======================================================`);
    console.log(`Executing DED Pipeline on Document B (${path.basename(pdfPathB)})...`);
    console.log(`======================================================`);

    const resultB = await dedRabPipeline.execute({
      projectId: 'PRJ-DIFF-B',
      projectName: 'Dokumen B: Struktur Uji QA P7Q',
      files: [
        {
          fileName: 'DED_UNIQUE_P7Q.pdf',
          buffer: bufferB,
          mimeType: 'application/pdf',
        },
      ],
      mode: 'FAST',
    });

    console.log(`Result B: Success=${resultB.success} Items=${resultB.workItems.length} Error=${resultB.error}`);

    // Core Assertions
    assert.equal(resultA.success, true, 'Document A pipeline must succeed');
    assert.equal(resultB.success, true, 'Document B pipeline must succeed');

    // 1. BAN 35 items & Rp 380M
    assert.notEqual(resultA.workItems.length, 35, 'Document A must NOT be hardcoded 35 items');
    assert.notEqual(resultB.workItems.length, 35, 'Document B must NOT be hardcoded 35 items');

    const totalA = resultA.workItems.reduce((acc, it) => acc + (it.price?.totalPrice || 0), 0);
    const totalB = resultB.workItems.reduce((acc, it) => acc + (it.price?.totalPrice || 0), 0);

    console.log(`\n[DIFFERENTIAL REPORT]`);
    console.log(`Document A: ${resultA.workItems.length} items | Total: Rp ${totalA.toLocaleString('id-ID')}`);
    console.log(`Document B: ${resultB.workItems.length} items | Total: Rp ${totalB.toLocaleString('id-ID')}`);

    const isAround380M_A = totalA > 370_000_000 && totalA < 390_000_000;
    const isAround380M_B = totalB > 370_000_000 && totalB < 390_000_000;
    assert.equal(isAround380M_A, false, 'Document A total must NOT be ~Rp 380 million sample total');
    assert.equal(isAround380M_B, false, 'Document B total must NOT be ~Rp 380 million sample total');

    // 2. Proves distinct items between Document A and Document B
    const itemNamesA = new Set(resultA.workItems.map((w) => w.name.trim().toLowerCase()));
    const itemNamesB = new Set(resultB.workItems.map((w) => w.name.trim().toLowerCase()));

    assert.notDeepEqual(itemNamesA, itemNamesB, 'Document A and B must produce distinct work item inventories');
    assert.notEqual(totalA, totalB, 'Document A and B must produce different total costs');

    // 3. Proves Lineage & DedAiWorkItem existence
    for (const itm of resultA.workItems) {
      assert.ok(itm.lineage, `Item ${itm.name} in Doc A must have complete lineage`);
      assert.ok(itm.lineage.dedDocumentId, 'Lineage must have dedDocumentId');
      assert.ok(itm.lineage.sourcePages.length > 0, 'Lineage must have sourcePages');
    }

    for (const itm of resultB.workItems) {
      assert.ok(itm.lineage, `Item ${itm.name} in Doc B must have complete lineage`);
      assert.ok(itm.lineage.dedDocumentId, 'Lineage must have dedDocumentId');
      assert.ok(itm.lineage.sourcePages.length > 0, 'Lineage must have sourcePages');
    }
  });
});

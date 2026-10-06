import assert from 'node:assert/strict';
import { dedInterpreter } from '../ded-rab-v2/interpretation/dedInterpreter';
import { ezrabCoreQto } from '../ded-rab-v2/qto/ezrabCoreQto';
import { dedSpreadsheetSync } from '../ded-rab-v2/spreadsheet/dedSpreadsheetSync';
import { dedVisionReader } from '../ded-rab-v2/ai/dedVisionReader';
import { RawPageAnalysisPass2, DedWorkItem } from '../ded-rab-v2/types';

const evidence = (id: string, pageNumber: number, content: string, type: 'DIMENSION' | 'NOTE' = 'DIMENSION') => ({
  id, type, content, confidence: 0.98,
});

const candidate = (tempId: string, name: string, evidenceIds: string[], dimensions: Record<string, { value: number | null; unit: string; evidenceId?: string }> = {}): RawPageAnalysisPass2['candidateItems'][number] => ({
  tempId, name, category: 'FOUNDATION', evidenceIds, dimensions, shape: 'RECTANGULAR', unit: 'm³', status: 'CONFIRMED',
});

function interpret(pages: RawPageAnalysisPass2[]) {
  return dedInterpreter.interpretWithBuildingModel('REGRESSION-PROJECT', 'REGRESSION-DOC', pages).workItems;
}

// A + E: repeated OCR occurrences and duplicate page evidence produce one canonical work.
{
  const items = interpret([
    { pageNumber: 1, evidences: [evidence('EV-W1', 1, 'Pondasi Batu Kali')], candidateItems: [candidate('OCR-1', 'Pondasi Batu Kali', ['EV-W1'])] },
    { pageNumber: 1, evidences: [evidence('EV-W2', 1, 'Pondasi batu kali'), evidence('EV-D1', 1, 'Panjang 10 m Lebar 0.60 m Tinggi 0.80 m')], candidateItems: [candidate('OCR-2', 'Pondasi batu kali', ['EV-W2', 'EV-D1'])] },
    { pageNumber: 2, evidences: [evidence('EV-W3', 2, 'PAS. BATU KALI')], candidateItems: [candidate('OCR-3', 'PAS. BATU KALI', ['EV-W3'])] },
  ]);
  assert.equal(items.length, 1, 'one physical work must produce one DedWorkItem');
  assert.match(items[0].canonicalWorkId || '', /FOUNDATION-pondasi-batu-kali/);
  assert.deepEqual(new Set(items[0].evidenceIds), new Set(['EV-W1', 'EV-W2', 'EV-D1', 'EV-W3']));
}

// B: dimension evidence on the same work page is associated before QTO.
{
  const item = interpret([{ pageNumber: 3, evidences: [evidence('EV-W', 3, 'Pondasi Batu Kali'), evidence('EV-L', 3, 'Panjang 12 m'), evidence('EV-B', 3, 'Lebar 0.50 m'), evidence('EV-H', 3, 'Tinggi 0.60 m')], candidateItems: [candidate('OCR', 'Pondasi Batu Kali', ['EV-W'])] }])[0];
  const qto = ezrabCoreQto.calculateQuantity(item);
  assert.equal(qto.quantity, 3.6);
  assert.equal(qto.status, 'CALCULATED');
  assert.equal(item.dimensions.length?.evidenceId, 'EV-L');
  assert.equal(item.dimensions.width?.evidenceId, 'EV-B');
  assert.equal(item.dimensions.height?.evidenceId, 'EV-H');
}

// C: AHSP components belong to one work row; spreadsheet draft is not expanded by components.
{
  const item: DedWorkItem = {
    ...interpret([{ pageNumber: 4, evidences: [evidence('EV-C', 4, 'Pondasi Batu Kali')], candidateItems: [candidate('OCR', 'Pondasi Batu Kali', ['EV-C'], { length: { value: 10, unit: 'm' }, width: { value: .6, unit: 'm' }, height: { value: .8, unit: 'm' } })] }])[0],
    qto: { formula: '10 × 0.6 × 0.8 = 4.8 m³', quantity: 4.8, unit: 'm³', status: 'CALCULATED' }, quantity: 4.8,
    price: { unitPrice: 597805, totalPrice: 2869464, priceSource: 'OFFICIAL_AHSP', isOfficial: true, currency: 'IDR', components: [
      { type: 'MATERIAL', name: 'Batu', unit: 'm³', coefficient: 1, unitPrice: 1, totalPrice: 1 },
      { type: 'LABOR', name: 'Pekerja', unit: 'OH', coefficient: 1, unitPrice: 1, totalPrice: 1 },
    ] },
  };
  const sheets = dedSpreadsheetSync.generateWorkspaceSheets({ projectId: 'P', projectName: 'P', sourceDocuments: [], workItems: [item], evidences: [] });
  assert.equal(sheets['08_RAB_DRAFT'].length, 1);
  assert.equal(sheets['08_RAB_DRAFT'][0].Volume, 4.8);
}

// D: bare references remain review metadata and never appear in RAB draft.
{
  const items = interpret([{ pageNumber: 5, evidences: [evidence('EV-REF', 5, 'P1 J1 BV1', 'NOTE')], candidateItems: [candidate('P1', 'P1', ['EV-REF']), candidate('J1', 'J1', ['EV-REF']), candidate('BV1', 'BV1', ['EV-REF'])] }]);
  const sheets = dedSpreadsheetSync.generateWorkspaceSheets({ projectId: 'P', projectName: 'P', sourceDocuments: [], workItems: items, evidences: [] });
  assert.equal(sheets['08_RAB_DRAFT'].length, 0);
}

// G: genuinely missing dimensions remain null; no zero/default quantity is introduced.
{
  const item = interpret([{ pageNumber: 6, evidences: [evidence('EV-M', 6, 'Pondasi Batu Kali')], candidateItems: [candidate('OCR', 'Pondasi Batu Kali', ['EV-M'])] }])[0];
  const qto = ezrabCoreQto.calculateQuantity(item);
  assert.equal(qto.quantity, null);
  assert.equal(item.quantity, undefined);
}

// Reader fallback uses explicit source text only; no invented geometry/work is generated.
{
  const page: any = { pageNumber: 9, nativeText: 'Pondasi Batu Kali disebut tanpa dimensi', imageDataUrl: '', drawingType: 'STRUCTURAL_PLAN' };
  const fallback = (dedVisionReader as any).fallbackTextExtraction(page, { pageNumber: 9, drawingType: 'STRUCTURAL_PLAN', drawingTitle: 'S-09', scale: 'NTS', scaleVerified: false, confidence: 1, notes: [], gridLines: [], constructionElementsFound: [] });
  assert.equal(fallback.candidateItems.length, 1);
  assert.equal(fallback.candidateItems[0].dimensions.length, undefined);
  assert.equal(fallback.candidateItems[0].dimensions.width, undefined);
  assert.equal(fallback.candidateItems[0].dimensions.height, undefined);
  const graphicWithoutText = (dedVisionReader as any).fallbackTextExtraction({ ...page, nativeText: '', imageDataUrl: 'data:image/png;base64,' + 'A'.repeat(800) }, { pageNumber: 9, drawingType: 'STRUCTURAL_PLAN', drawingTitle: 'S-09', scale: 'NTS', scaleVerified: false, confidence: 1, notes: [], gridLines: [], constructionElementsFound: [] });
  assert.equal(graphicWithoutText.candidateItems.length, 0, 'image presence alone must not synthesize a work item');
}

console.log('Canonical evidence regression: A-G PASS');
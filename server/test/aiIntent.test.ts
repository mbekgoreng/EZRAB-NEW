import assert from 'assert';
import { constructionIntentClassifier } from '../ai/intent/intentClassifier';
import { EntityExtractor } from '../ai/intent/entityExtractor';

export async function runAiIntentTestSuite(): Promise<void> {
  console.log('--- Running AI Intent & Entity Extraction Test Suite ---');

  // 1. RAB Total Intent
  const res1 = constructionIntentClassifier.classify('Berapa total RAB proyek ini?');
  assert.strictEqual(res1.intent, 'RAB_TOTAL');
  assert.strictEqual(res1.requiresProject, true);
  assert.strictEqual(res1.requiresTool, true);

  // 2. QTO Calculation Intent
  const res2 = constructionIntentClassifier.classify('Tolong hitung volume sloof beton');
  assert.strictEqual(res2.intent, 'QTO_CALCULATE');
  assert.strictEqual(res2.requiresProject, true);

  // 3. AHSP Search Intent
  const res3 = constructionIntentClassifier.classify('Cari AHSP analisa harga satuan pasangan bata');
  assert.strictEqual(res3.intent, 'AHSP_SEARCH');
  assert.strictEqual(res3.requiresTool, true);

  // 4. Construction Knowledge Intent
  const res4 = constructionIntentClassifier.classify('Apa fungsi bouwplank dalam persiapan konstruksi?');
  assert.strictEqual(res4.intent, 'CONSTRUCTION_KNOWLEDGE');
  assert.strictEqual(res4.requiresProject, false);

  // 5. Ambiguity Handling -> Clarification Needed
  const res5 = constructionIntentClassifier.classify('tambah pondasi');
  assert.strictEqual(res5.intent, 'CLARIFICATION_NEEDED');
  assert.ok(res5.clarificationOptions && res5.clarificationOptions.length >= 2);

  // 6. Mutating RAB Item Creation Intent with Entity Extraction
  const res6 = constructionIntentClassifier.classify('Tambahkan waterproofing kamar mandi 12 m2 harga Rp 150.000');
  assert.strictEqual(res6.intent, 'RAB_ITEM_CREATE');
  assert.strictEqual(res6.isMutatingAction, true);
  assert.strictEqual(res6.entities.volume, 12);
  assert.strictEqual(res6.entities.unit, 'm2');
  assert.strictEqual(res6.entities.price, 150000);

  // 7. Contextual Query ("Yang paling mahal apa?" on RAB page)
  const res7 = constructionIntentClassifier.classify('Yang paling mahal apa?', 'rab');
  assert.strictEqual(res7.intent, 'RAB_ITEM_SEARCH');

  // 8. Entity extraction for materials and locations
  const entities = EntityExtractor.extract('Pengecoran dak beton Surabaya luas 150 m2 2 lantai dengan besi ulir');
  assert.strictEqual(entities.location, 'JAWA_TIMUR');
  assert.strictEqual(entities.buildingArea, 150);
  assert.strictEqual(entities.floor, 2);
  assert.strictEqual(entities.material, 'besi ulir');

  console.log('✅ All 8 AI Intent & Entity Extraction assertions PASSED');
}

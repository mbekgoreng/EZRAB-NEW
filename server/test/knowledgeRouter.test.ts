import assert from 'assert';
import { knowledgeRetriever } from '../ai/knowledge/knowledgeRetriever';
import { knowledgeRegistry } from '../ai/knowledge/knowledgeRegistry';

export async function runKnowledgeRouterTestSuite(): Promise<void> {
  console.log('--- Running Knowledge Router, RAG & AHSP Safety Test Suite ---');

  // 1. Knowledge registry defaults loaded
  const allEntries = knowledgeRegistry.getAll();
  assert.ok(allEntries.length >= 7, 'Must have standard construction knowledge entries');

  // 2. RAG search for bouwplank
  const searchBouwplank = knowledgeRetriever.search({ query: 'apa fungsi bouwplank dalam pekerjaan persiapan?' });
  assert.ok(searchBouwplank.length > 0);
  assert.strictEqual(searchBouwplank[0].id, 'KNOW-BOUWPLANK');
  assert.ok(searchBouwplank[0].relevance > 0.5);

  // 3. RAG search for waterproofing
  const searchWp = knowledgeRetriever.search({ query: 'waterproofing kamar mandi dak beton' });
  assert.ok(searchWp.length > 0);
  assert.strictEqual(searchWp[0].id, 'KNOW-WATERPROOFING');

  // 4. AHSP Safety: Valid match from official PUPR database
  const ahspValid = knowledgeRetriever.resolveAhspItem('batu kali');
  assert.strictEqual(ahspValid.verified, true);
  assert.strictEqual(ahspValid.source, 'ahsp_database');
  assert.ok(ahspValid.value);
  assert.ok(ahspValid.value.code);

  // 5. AHSP Safety: Unknown item MUST NOT invent fake code
  const ahspUnknown = knowledgeRetriever.resolveAhspItem('pekerjaan instalasi robot laser quantum 5000');
  assert.strictEqual(ahspUnknown.verified, false);
  assert.strictEqual(ahspUnknown.value, null);
  assert.strictEqual(ahspUnknown.source, 'assumption');

  console.log('✅ All 5 Knowledge Router, RAG & AHSP Safety assertions PASSED');
}

/**
 * constructionIntelligence.test.ts — tes Fase Intelligence Engine
 * (perluasan ketiga owner, 2026-11-08):
 *
 * 1. Knowledge base: provenance lengkap di SEMUA record, ID kalkulator
 *    merujuk registry nyata, label WBS konseptual hadir.
 * 2. Retrieval lokal deterministik: query contoh → record teratas yang
 *    diharapkan (precision@1 terukur), batas maxResults, sitasi ada.
 * 3. IR terstruktur: kasus penerimaan gudang 10×20 + lahan 500.
 * 4. Registry tool: 11 entri, CalculateQTO TIDAK TERSEDIA, dan
 *    CalculateBuildingArea tidak pernah mengali lantai yang tidak
 *    disebut eksplisit oleh pemanggil.
 * 5. Feedback terkendali: tangkap + dedup + ringkasan; tidak ada
 *    pembelajaran otomatis (stage berhenti di 'captured').
 *
 * Jalankan: npx --yes tsx src/test/constructionIntelligence.test.ts
 * Lapisan: DETERMINISTIK (parser/KB/retrieval/tool lokal). BUKAN tes
 * model live.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Mock localStorage SEBELUM impor modul yang menyentuh template service.
(globalThis as any).window = {
  localStorage: {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
    clear: () => undefined,
  },
};

import {
  CONSTRUCTION_KNOWLEDGE,
  CONCEPTUAL_WBS_LABEL,
  getKnowledgeRecord,
} from '../ai-tools/ezrab-ai/constructionKnowledge';
import {
  searchConstructionKnowledge,
  searchWithOutcome,
  formatKnowledgeContext,
} from '../ai-tools/ezrab-ai/constructionRetrieval';
import {
  CONSTRUCTION_TOOL_REGISTRY,
  toolCalculateBuildingArea,
  toolCalculateQto,
  toolExtractProjectDimensions,
} from '../ai-tools/ezrab-ai/constructionTools';
import {
  captureFeedback,
  listFeedback,
  feedbackSummary,
  clearFeedback,
  advanceFeedbackStage,
  FEEDBACK_STAGE_ORDER,
} from '../ai-tools/ezrab-ai/constructionFeedback';
import { understandProject, componentStatusFromItem } from '../ai-tools/ezrab-ai/buildingTypology';
import { calculatorRegistry } from '../engine/calculatorCore/registry/calculatorRegistry';

let pass = 0;
let fail = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) { pass += 1; console.log(`  PASS ${name}`); }
  else { fail += 1; failures.push(`${name} ${detail}`); console.log(`  FAIL ${name} ${detail}`); }
}

/* --- 1. KB integrity ------------------------------------------------ */
console.log('KB integrity:');
check('KB berisi ≥ 30 record', CONSTRUCTION_KNOWLEDGE.length >= 30, `(${CONSTRUCTION_KNOWLEDGE.length})`);
const ids = new Set(CONSTRUCTION_KNOWLEDGE.map((r) => r.id));
check('ID record unik', ids.size === CONSTRUCTION_KNOWLEDGE.length);
let provenanceOk = true;
let wbsOk = true;
for (const r of CONSTRUCTION_KNOWLEDGE) {
  const p = r.provenance;
  if (!p || !p.source || !p.sourceDate || !p.verificationStatus || !p.version || !p.discipline || !p.applicableScope) provenanceOk = false;
  if (!Array.isArray(r.conceptualWbs) || r.conceptualWbs.length === 0) wbsOk = false;
}
check('provenance lengkap di semua record (source, tanggal, status verifikasi, versi, disiplin, cakupan)', provenanceOk);
check('label WBS konseptual persis "conceptual work breakdown, not a verified BOQ"', CONCEPTUAL_WBS_LABEL === 'conceptual work breakdown, not a verified BOQ');
check('setiap record punya conceptualWbs tidak kosong', wbsOk);
check('tidak ada record mengklaim sumber resmi palsu (semua unverified/internal)', CONSTRUCTION_KNOWLEDGE.every((r) => r.provenance.verificationStatus === 'unverified' && r.provenance.source.includes('unverified against official standard')));

const validCalcIds = new Set(calculatorRegistry.list().map((c) => c.id));
let calcRefs = 0;
let calcBad: string[] = [];
for (const r of CONSTRUCTION_KNOWLEDGE) {
  for (const cid of r.availableCalculators) {
    calcRefs += 1;
    if (!validCalcIds.has(cid)) calcBad.push(`${r.id}:${cid}`);
  }
}
check(`semua rujukan kalkulator KB valid di registry nyata (${calcRefs} rujukan)`, calcBad.length === 0, calcBad.join(', '));
check('getKnowledgeRecord("gudang") ada', getKnowledgeRecord('gudang')?.id === 'gudang');
check('getKnowledgeRecord untuk id tak dikenal = null', getKnowledgeRecord('tidak-ada') === null);

/* --- 2. Retrieval evaluation ---------------------------------------- */
console.log('Retrieval evaluation (precision@1):');
const retrievalCases: Array<{ query: string; expectTop: string }> = [
  { query: 'buatkan rab gudang logistik', expectTop: 'gudang' },
  { query: 'jalan aspal hotmix 1 km', expectTop: 'jalan-aspal' },
  { query: 'pondasi bore pile dalam', expectTop: 'pondasi-khusus' },
  { query: 'instalasi listrik panel', expectTop: 'listrik' },
  { query: 'renovasi kamar mandi ganti keramik', expectTop: 'renovasi' },
  { query: 'saluran u-ditch drainase', expectTop: 'drainase' },
  { query: 'tembok penahan tanah turap', expectTop: 'retaining-wall' },
  { query: 'rumah sakit gas medis', expectTop: 'rumah-sakit' },
  { query: 'atap baja ringan genteng', expectTop: 'atap' },
  { query: 'kandang ayam greenhouse', expectTop: 'pertanian' },
  { query: 'jembatan bentang 12 meter', expectTop: 'jembatan' },
  { query: 'septic tank ipal air limbah', expectTop: 'sanitasi' },
];
let topHits = 0;
for (const c of retrievalCases) {
  const hits = searchConstructionKnowledge(c.query, { maxResults: 5 });
  const top = hits[0]?.record.id ?? null;
  if (top === c.expectTop) topHits += 1;
  check(`query "${c.query}" → teratas ${c.expectTop}`, top === c.expectTop, `(dapat ${top})`);
}
const precisionAt1 = topHits / retrievalCases.length;
check(`precision@1 retrieval = ${(precisionAt1 * 100).toFixed(1)}% (≥ 80%)`, precisionAt1 >= 0.8);

const manyHits = searchConstructionKnowledge('bangunan struktur pondasi atap lantai dinding', { maxResults: 3 });
check('batas maxResults dihormati (≤ 3)', manyHits.length <= 3, `(${manyHits.length})`);
const gudangHits = searchConstructionKnowledge('gudang');
check('setiap hit membawa sitasi provenance [KB:…]', gudangHits.length > 0 && gudangHits.every((h) => h.citation.startsWith('[KB:') && h.citation.includes('status verifikasi:')));
const ctx = formatKnowledgeContext(gudangHits);
check('konteks terformat menyatakan bahan referensi (bukan kebenaran mutlak)', ctx.includes('bukan kebenaran mutlak'));
check('query tanpa makna konstruksi → 0 hit', searchConstructionKnowledge('zzz qqq www').length === 0);
check('filter kategori bekerja', searchConstructionKnowledge('gudang pabrik workshop', { filters: { category: 'Industrial' } }).every((h) => h.record.category === 'Industrial'));

/* --- 2b. Retrieval evaluation dataset ≥100 query (finalisasi §6) ----- */
console.log('Retrieval evaluation dataset (≥100 query):');
{
  const here = dirname(fileURLToPath(import.meta.url));
  const evalData = JSON.parse(readFileSync(join(here, 'constructionRetrievalEval.json'), 'utf8')) as {
    cases: Array<{ q: string; expectTop?: string; expectInTop3?: string; negative?: boolean }>;
  };
  check(`dataset evaluasi berisi ≥100 query (${evalData.cases.length})`, evalData.cases.length >= 100);
  let top1Total = 0; let top1Hit = 0; let top3Total = 0; let top3Hit = 0; let negTotal = 0; let negOk = 0;
  const misses: string[] = [];
  for (const c of evalData.cases) {
    const hits = searchConstructionKnowledge(c.q, { maxResults: 5 });
    if (c.negative) {
      negTotal += 1;
      if (hits.length === 0) negOk += 1; else misses.push(`neg:"${c.q}"→${hits[0].record.id}`);
    } else if (c.expectTop) {
      top1Total += 1;
      if (hits[0]?.record.id === c.expectTop) top1Hit += 1; else misses.push(`top1:"${c.q}" harap ${c.expectTop} dapat ${hits[0]?.record.id ?? '—'}`);
    } else if (c.expectInTop3) {
      top3Total += 1;
      if (hits.slice(0, 3).some((h) => h.record.id === c.expectInTop3)) top3Hit += 1; else misses.push(`top3:"${c.q}" harap ${c.expectInTop3} di 3 teratas`);
    }
  }
  console.log(`  METRIK TERUKUR — precision@1: ${top1Hit}/${top1Total} (${(100 * top1Hit / top1Total).toFixed(1)}%) · recall-in-top3: ${top3Hit}/${top3Total} (${(100 * top3Hit / top3Total).toFixed(1)}%) · negatif benar: ${negOk}/${negTotal}`);
  if (misses.length) console.log(`  misses: ${misses.join(' | ')}`);
  check('precision@1 dataset ≥ 80%', top1Hit / top1Total >= 0.8, `${top1Hit}/${top1Total}`);
  check('recall-in-top3 dataset ≥ 80%', top3Hit / top3Total >= 0.8, `${top3Hit}/${top3Total}`);
  check('semua query negatif → 0 hit (tidak ada pengetahuan karangan)', negOk === negTotal, `${negOk}/${negTotal}`);
  const outcome = searchWithOutcome('resep masakan rendang padang');
  check('searchWithOutcome: hasil negatif membawa alasan eksplisit', outcome.hits.length === 0 && !!outcome.negativeReason);
  const outcomePos = searchWithOutcome('buatkan rab gudang logistik');
  check('searchWithOutcome: hasil positif tanpa alasan negatif', outcomePos.hits.length > 0 && outcomePos.negativeReason === null);
  check('filter versi provenance bekerja', searchConstructionKnowledge('gudang', { filters: { version: '1.0' } }).length > 0 && searchConstructionKnowledge('gudang', { filters: { version: '9.9' } }).length === 0);
  check('KB kini ≥ 50 record (perluasan §6)', CONSTRUCTION_KNOWLEDGE.length >= 50, `(${CONSTRUCTION_KNOWLEDGE.length})`);
  const cats = new Set(CONSTRUCTION_KNOWLEDGE.map((r) => r.category));
  check('KB mencakup 10 kategori brief', cats.size === 10, [...cats].join(','));
}

/* --- 3. IR acceptance ------------------------------------------------ */
console.log('IR acceptance:');
const u = understandProject('buatkan rab gudang ukuran 10 x 20 m dengan luas lahan 500 m2');
check('fungsi = gudang', u.functionId === 'gudang', `(${u.functionId})`);
check('footprint = 200 m²', u.footprint.value === 200, `(${u.footprint.value})`);
check('luas lahan = 500 m² terpisah', u.landArea.value === 500, `(${u.landArea.value})`);
check('cakupan = 40%', u.coveragePct === 40, `(${u.coveragePct})`);
check('lantai = asumsi 1 terlabel (bukan eksplisit)', u.floors.value === 1 && u.floors.source === 'assumption' && u.floors.explicit === false);
const viaTool = toolExtractProjectDimensions({ text: 'buatkan rab gudang ukuran 10 x 20 m dengan luas lahan 500 m2' });
check('tool ExtractProjectDimensions konsisten dengan IR langsung', viaTool.footprint.value === 200 && viaTool.landArea.value === 500);

/* --- 4. Tool registry ------------------------------------------------ */
console.log('Tool registry:');
check('registry berisi 11 tool', CONSTRUCTION_TOOL_REGISTRY.length === 11, `(${CONSTRUCTION_TOOL_REGISTRY.length})`);
const qto = CONSTRUCTION_TOOL_REGISTRY.find((t) => t.name === 'CalculateQTO');
check('CalculateQTO AVAILABLE (finalisasi §7: wrapper calculatorCore terverifikasi)', qto?.availability === 'AVAILABLE' && /calculatorRegistry/.test(qto.backing));
check('semua tool AVAILABLE', CONSTRUCTION_TOOL_REGISTRY.every((t) => t.availability === 'AVAILABLE'));
check('setiap entri punya skema input & output', CONSTRUCTION_TOOL_REGISTRY.every((t) => !!t.inputSchema && !!t.outputSchema));

const areaNoFloors = toolCalculateBuildingArea({ widthM: 10, lengthM: 20 });
check('CalculateBuildingArea tanpa lantai: footprint 200, total luas lantai null (tidak dikali asumsi)', areaNoFloors.footprintM2 === 200 && areaNoFloors.totalFloorAreaM2 === null && areaNoFloors.floorsBasis === 'not-multiplied');
const areaFloors = toolCalculateBuildingArea({ widthM: 10, lengthM: 20, floors: 2 });
check('CalculateBuildingArea lantai eksplisit 2: total 400, basis explicit', areaFloors.totalFloorAreaM2 === 400 && areaFloors.floorsBasis === 'explicit');
let threw = false;
try { toolCalculateBuildingArea({ widthM: 0, lengthM: 20 }); } catch { threw = true; }
check('CalculateBuildingArea menolak dimensi ≤ 0', threw);
threw = false;
try { toolExtractProjectDimensions({ text: '  ' }); } catch { threw = true; }
check('ExtractProjectDimensions menolak teks kosong', threw);

/* CalculateQTO (finalisasi §7): wrapper nyata atas calculatorCore. */
const qtoRoad = toolCalculateQto({
  calculatorId: 'road.geometry',
  inputs: { panjang: 100, lebar: 6, tebalPerkerasan: 0.05, lebarBahu: 1 },
  expectedUnit: 'm2',
});
check('CalculateQTO road.geometry: luas 600 m2', qtoRoad.primaryQuantity === 600 && qtoRoad.primaryUnit === 'm2', `(${qtoRoad.primaryQuantity} ${qtoRoad.primaryUnit})`);
check('CalculateQTO membawa provenance hitungan', qtoRoad.provenance.length > 0 && !!qtoRoad.calculatorVersion);
threw = false;
try { toolCalculateQto({ calculatorId: 'tidak-ada-kalkulator-ini', inputs: {} }); } catch { threw = true; }
check('CalculateQTO menolak kalkulator tak terdaftar', threw);
threw = false;
try {
  toolCalculateQto({ calculatorId: 'road.geometry', inputs: { panjang: 100, lebar: 6, tebalPerkerasan: 0.05, lebarBahu: 1 }, expectedUnit: 'm3' });
} catch { threw = true; }
check('CalculateQTO menolak satuan tak kompatibel (m2 vs m3)', threw);
threw = false;
try { toolCalculateQto({ calculatorId: 'road.geometry', inputs: { panjang: -5 } }); } catch { threw = true; }
check('CalculateQTO menolak input invalid (validasi skema registry)', threw);

/* --- 5. Component status taxonomy ------------------------------------ */
console.log('Component status:');
check('item berharga & termeta → CALCULABLE', componentStatusFromItem({ priceStatus: 'OFFICIAL', unitPrice: 1000, ahspMappingStatus: 'MAPPED' }) === 'CALCULABLE');
check('harga null → PRICE_UNRESOLVED', componentStatusFromItem({ priceStatus: 'OFFICIAL', unitPrice: null }) === 'PRICE_UNRESOLVED');
check('PRICE_UNRESOLVED → PRICE_UNRESOLVED', componentStatusFromItem({ priceStatus: 'PRICE_UNRESOLVED', unitPrice: 5000 }) === 'PRICE_UNRESOLVED');
check('UNIT_MISMATCH → REQUIRES_SPECIFICATION', componentStatusFromItem({ priceStatus: 'OFFICIAL', unitPrice: 5000, ahspMappingStatus: 'UNIT_MISMATCH' }) === 'REQUIRES_SPECIFICATION');

/* --- 6. Feedback capture --------------------------------------------- */
console.log('Feedback:');
clearFeedback();
const e1 = captureFeedback('user-correction', 'gudang bukan gedung', { correctedTo: 'gudang' });
const e2 = captureFeedback('user-correction', 'Gudang   bukan   gedung', { correctedTo: 'gudang' });
check('dedup: subjek sama (normalisasi spasi/kapital) digabung', e1.id === e2.id && listFeedback().length === 1);
check('occurrences bertambah pada dedup', e2.occurrences === 2);
check('stage awal selalu captured (tidak ada pembelajaran otomatis)', e1.stage === 'captured');
captureFeedback('classification-failure', 'pabrik tidak dikenali', {});
const summary = feedbackSummary();
check('ringkasan per jenis benar', summary['user-correction'] === 2 && summary['classification-failure'] === 1);
/* Pipeline review (finalisasi §10): transisi hanya oleh reviewer manusia. */
check('urutan stage pipeline sesuai brief (7 tahap)', FEEDBACK_STAGE_ORDER.join(',') === 'captured,deduped,validated,expert-approved,knowledge-updated,regression-tested,released');
const evPipe = captureFeedback('missing-knowledge', 'topik xyz belum ada di kb', {});
threw = false;
try { advanceFeedbackStage(evPipe.id, '', ''); } catch { threw = true; }
check('transisi tanpa reviewer/note DITOLAK', threw && evPipe.stage === 'captured');
const adv1 = advanceFeedbackStage(evPipe.id, 'reviewer-uji', 'duplikat diperiksa manual');
check('transisi sah maju TEPAT satu tahap (captured→deduped)', adv1.stage === 'deduped');
check('catatan reviewer tercatat di event', JSON.stringify(evPipe.detail).includes('reviewer-uji'));
threw = false;
try { advanceFeedbackStage('fb-tidak-ada', 'reviewer-uji', 'x'); } catch { threw = true; }
check('transisi event tak dikenal DITOLAK', threw);
clearFeedback();
check('clearFeedback mengosongkan store (untuk tes)', listFeedback().length === 0);

console.log(`\nCONSTRUCTION INTELLIGENCE: ${pass} PASS, ${fail} FAIL`);
if (failures.length > 0) {
  console.log('Kegagalan:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}

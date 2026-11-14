/**
 * w1DedMode.test.ts — W1 DED-RAB AI DUAL MODE (2026-11-13): TIPE MODE
 * KANONIS + STATE + KNOWLEDGE.
 *
 * Yang dibuktikan suite ini (directive §3 UI / §4 knowledge / §10
 * state — nomor directive, bukan nomor discovery):
 *  (a) G-ST-3: SATU definisi kanonis DedEstimationPolicy (dedMode.ts);
 *      ketiga tempat lama hanya re-export/alias; nilai string tak berubah.
 *  (b) C1: pemetaan mode→policy/mesin (EZRAB_AI→DATABASE+STANDARD,
 *      FULL_AI→FULL_AI+FULL_AI); default sesi baru EZRAB_AI (C2).
 *  (c) Migrasi legacy modeFromLegacy + resolveDraftMode (draft lama
 *      tanpa mode diturunkan; draft baru mempertahankan mode tersimpan).
 *  (d) Aturan kanonik §4 A–D sebagai data + guard (isolasi B, kontrak
 *      output C, engine finansial kanonis D, mode awareness A).
 *  (e) G-ST-1: mode/policy bertahan lewat lampiran DED (attach →
 *      attachmentToDedOutput); hardcode policy FULL_AI sudah hilang;
 *      lampiran lama tanpa policy tetap terbaca sebagai FULL_AI.
 *  (f) G-ST-2: logika draft (resolveDraftMode + depthModeFromFullAi) +
 *      penjaga sumber view.tsx/FullAiResultView (handler + prop draft
 *      Full AI ada). Handler React sendiri tidak dapat dijalankan di
 *      tsx tanpa DOM — diverifikasi lewat helper murni yang dipakainya
 *      + penjaga sumber (pola chatPhase5DedQto:641).
 *  (g) G-KN-1/G-KN-2: seksi DED sadar mode — buildDedSection membawa
 *      baris mode dari policy asal; builder kanonis menstempel baris
 *      mode bila pemanggil membawa dedMode/dedPolicy, dan TIDAK
 *      mengubah apa pun bila keduanya absen (backward compat + pin
 *      anggaran DED 800 tetap).
 *
 * Jalankan: npx --yes tsx src/test/w1DedMode.test.ts
 * (Skrip tsx mandiri dengan assert — pola p5RoundingTolerance/s2.)
 * TANPA panggilan provider, TANPA mengubah berkas src selain suite ini.
 * localStorage di-stub di memori (attach/load lampiran).
 */
import { strict as assert } from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CANONICAL_FINANCIAL_ENGINE,
  DEFAULT_DED_RAB_AI_MODE,
  DED_KNOWLEDGE_RULES,
  DED_RAB_AI_MODES,
  canUseCanonicalCatalog,
  canUseInternalPriceData,
  depthModeFromFullAi,
  describeModeForContext,
  engineForMode,
  financialEngineForMode,
  isCanonicalFinancialEngine,
  isDedEstimationPolicy,
  isDedRabAiMode,
  isLegacyHybrid,
  knowledgeRule,
  modeForEngine,
  modeFromLegacy,
  modeLabel,
  normalizeMode,
  normalizePolicy,
  outputContractForMode,
  policyForMode,
  policyLabel,
  resolveDraftMode,
} from '../ai-tools/ded-ai-estimate/dedMode';
import { normalizePromptPolicy } from '../ai-tools/ded-ai-estimate/prompts/policy';
import {
  attachDedToProject,
  attachmentToDedOutput,
  loadDedAttachment,
  type DedAttachment,
} from '../ai-tools/ezrab-ai/dedQtoIntegration';
import {
  buildDedSection,
  extractSpecsFromDedOutput,
  formatDedUnderstandingLines,
} from '../ai-tools/ezrab-ai/dedUnderstanding';
import { buildCanonicalContext } from '../ai-tools/ezrab-ai/canonicalContext';
import type { DedAiOutput } from '../ai-tools/ded-ai-estimate/types';

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
function eq(name: string, actual: unknown, expected: unknown): void {
  check(name, actual === expected, `aktual=${JSON.stringify(actual)} harap=${JSON.stringify(expected)}`);
}
function section(title: string): void {
  console.log(`\n-- ${title} --`);
}

// ---------------------------------------------------------------- stub storage
const memStore = new Map<string, string>();
const stubStorage = {
  getItem: (k: string) => (memStore.has(k) ? memStore.get(k)! : null),
  setItem: (k: string, v: string) => { memStore.set(k, v); },
  removeItem: (k: string) => { memStore.delete(k); },
  clear: () => { memStore.clear(); },
  key: (i: number) => Array.from(memStore.keys())[i] ?? null,
  get length() { return memStore.size; },
};
(globalThis as unknown as { localStorage: unknown }).localStorage = stubStorage;

// ---------------------------------------------------------------- fixtures
function dedOutput(policy: 'FULL_AI' | 'DATABASE'): DedAiOutput {
  return {
    success: true,
    jobId: `job-w1-${policy}`,
    projectType: 'BANGUNAN',
    mode: 'FAST',
    policy,
    projectName: 'Rumah Uji W1',
    fileName: 'ded-uji.pdf',
    pageCount: 3,
    items: [
      {
        id: 'it-1', name: 'Beton K-300', category: 'Struktur', units: 'm3',
        quantity: 12, quantitySource: 'DED_EXPLICIT', unitPrice: 1000000,
        priceSource: policy === 'DATABASE' ? 'AHSP_2026' : 'AI_ESTIMATE',
        ahspCode: 'A.1.1', sourcePages: [1], provenance: [],
      },
    ],
    grandTotal: 12000000,
    categorySummaries: [],
    coverage: {
      totalItems: 1, itemsWithQuantity: 1, itemsWithPrice: 1,
      itemsFullyResolved: 1, itemsUnresolved: 0, partial: false,
    },
    partial: false,
    divisionCoverage: [],
  } as unknown as DedAiOutput;
}

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
function readSrc(rel: string): string {
  return fs.readFileSync(path.join(SRC, rel), 'utf8');
}

// ================================================================ (a) G-ST-3
section('(a) G-ST-3 — satu definisi kanonis DedEstimationPolicy');
{
  const dedModeSrc = readSrc('ai-tools/ded-ai-estimate/dedMode.ts');
  const stdTypesSrc = readSrc('ai-tools/ded-ai-estimate/types.ts');
  const fullTypesSrc = readSrc('ai-tools/ded-full-ai/types.ts');
  const policySrc = readSrc('ai-tools/ded-ai-estimate/prompts/policy.ts');
  const defCount = (dedModeSrc.match(/export type DedEstimationPolicy = 'FULL_AI' \| 'DATABASE';/g) ?? []).length;
  eq('dedMode.ts mendefinisikan DedEstimationPolicy tepat 1×', defCount, 1);
  check('types.ts standar tidak lagi mendefinisikan union policy sendiri',
    !/export type DedEstimationPolicy = 'FULL_AI'/.test(stdTypesSrc));
  check('types.ts standar me-re-export dari dedMode',
    stdTypesSrc.includes("from './dedMode'") && stdTypesSrc.includes('export type { DedEstimationPolicy }'));
  check('types.ts Full AI tidak lagi mendefinisikan union policy sendiri',
    !/export type DedEstimationPolicy = 'FULL_AI'/.test(fullTypesSrc));
  check('types.ts Full AI me-re-export dari dedMode',
    fullTypesSrc.includes("from '../ded-ai-estimate/dedMode'") && fullTypesSrc.includes('export type { DedEstimationPolicy }'));
  check('prompts/policy.ts tidak lagi mendefinisikan union policy sendiri',
    !/export type DedPromptPricingPolicy = 'FULL_AI'/.test(policySrc));
  check('DedPromptPricingPolicy kini alias DedEstimationPolicy',
    policySrc.includes('export type DedPromptPricingPolicy = DedEstimationPolicy;'));
  // Nilai string tak berubah: perilaku normalisasi ketiga jalur sama.
  for (const v of ['DATABASE', 'FULL_AI', undefined, 'XXX', null] as const) {
    eq(`normalizePromptPolicy(${JSON.stringify(v)}) ≡ normalizePolicy`, normalizePromptPolicy(v as never), normalizePolicy(v));
  }
  // v3 DedAiMode yang bertabrakan nama TIDAK disentuh (di luar cakupan).
  const v3Src = readSrc('ded-rab-v3/ai/aiProviderClient.ts');
  check('DedAiMode v3 masih ada & tak disentuh (di luar cakupan)',
    v3Src.includes("'quick'") && v3Src.includes("'advanced'"));
}

// ================================================================ (b) C1/C2
section('(b) C1 — pemetaan mode→policy/mesin; C2 — default EZRAB_AI');
{
  eq('policyForMode(EZRAB_AI)', policyForMode('EZRAB_AI'), 'DATABASE');
  eq('policyForMode(FULL_AI)', policyForMode('FULL_AI'), 'FULL_AI');
  eq('engineForMode(EZRAB_AI)', engineForMode('EZRAB_AI'), 'STANDARD');
  eq('engineForMode(FULL_AI)', engineForMode('FULL_AI'), 'FULL_AI');
  eq('modeForEngine(STANDARD)', modeForEngine('STANDARD'), 'EZRAB_AI');
  eq('modeForEngine(FULL_AI)', modeForEngine('FULL_AI'), 'FULL_AI');
  eq('modeForEngine ∘ engineForMode = identitas (EZRAB_AI)', modeForEngine(engineForMode('EZRAB_AI')), 'EZRAB_AI');
  eq('modeForEngine ∘ engineForMode = identitas (FULL_AI)', modeForEngine(engineForMode('FULL_AI')), 'FULL_AI');
  eq('modeLabel(EZRAB_AI)', modeLabel('EZRAB_AI'), 'EZRAB AI');
  eq('modeLabel(FULL_AI)', modeLabel('FULL_AI'), 'Full AI');
  eq('policyLabel(DATABASE)', policyLabel('DATABASE'), 'EZRAB AI MODE');
  eq('policyLabel(FULL_AI)', policyLabel('FULL_AI'), 'FULL AI MODE');
  eq('default sesi baru (C2)', DEFAULT_DED_RAB_AI_MODE, 'EZRAB_AI');
  eq('persis 2 mode user-facing', DED_RAB_AI_MODES.length, 2);
  check('DED_RAB_AI_MODES memuat keduanya',
    DED_RAB_AI_MODES.includes('EZRAB_AI') && DED_RAB_AI_MODES.includes('FULL_AI'));
}

// ================================================================ (c) migrasi
section('(c) Migrasi legacy — modeFromLegacy / resolveDraftMode');
{
  eq('legacy {FULL_AI, mesin Full AI} → FULL_AI',
    modeFromLegacy({ policy: 'FULL_AI', fullAi: true }), 'FULL_AI');
  eq('legacy {DATABASE, mesin Full AI} → FULL_AI (mesin menang)',
    modeFromLegacy({ policy: 'DATABASE', fullAi: true }), 'FULL_AI');
  eq('legacy {DATABASE, standar} → EZRAB_AI',
    modeFromLegacy({ policy: 'DATABASE', fullAi: false }), 'EZRAB_AI');
  eq('legacy {FULL_AI, standar} → EZRAB_AI (hibrida lama; policy dipertahankan terpisah)',
    modeFromLegacy({ policy: 'FULL_AI', fullAi: false }), 'EZRAB_AI');
  eq('legacy {} → EZRAB_AI (default C2)',
    modeFromLegacy({}), 'EZRAB_AI');
  eq('legacy {DATABASE, fullAi tak ada} → EZRAB_AI',
    modeFromLegacy({ policy: 'DATABASE' }), 'EZRAB_AI');
  eq('isLegacyHybrid: standar+FULL_AI = hibrida',
    isLegacyHybrid({ policy: 'FULL_AI', fullAi: false }), true);
  eq('isLegacyHybrid: Full AI+DATABASE = hibrida',
    isLegacyHybrid({ policy: 'DATABASE', fullAi: true }), true);
  eq('isLegacyHybrid: standar+DATABASE = kanonis',
    isLegacyHybrid({ policy: 'DATABASE', fullAi: false }), false);
  eq('isLegacyHybrid: Full AI+FULL_AI = kanonis',
    isLegacyHybrid({ policy: 'FULL_AI', fullAi: true }), false);
  eq('normalizePolicy(DATABASE)', normalizePolicy('DATABASE'), 'DATABASE');
  eq('normalizePolicy(tak dikenal) → FULL_AI', normalizePolicy('XXX'), 'FULL_AI');
  eq('normalizePolicy(undefined) → FULL_AI', normalizePolicy(undefined), 'FULL_AI');
  eq('normalizeMode(FULL_AI)', normalizeMode('FULL_AI'), 'FULL_AI');
  eq('normalizeMode(tak dikenal) → EZRAB_AI', normalizeMode('XXX'), 'EZRAB_AI');
  check('isDedRabAiMode menerima keduanya & menolak lain',
    isDedRabAiMode('EZRAB_AI') && isDedRabAiMode('FULL_AI') && !isDedRabAiMode('DATABASE') && !isDedRabAiMode(null));
  check('isDedEstimationPolicy menerima keduanya & menolak lain',
    isDedEstimationPolicy('FULL_AI') && isDedEstimationPolicy('DATABASE') && !isDedEstimationPolicy('EZRAB_AI'));

  // resolveDraftMode — satu-satunya logika restore draft (dipakai handleLoadDraft).
  eq('draft baru FULL_AI: mode tersimpan menang',
    JSON.stringify(resolveDraftMode({ policy: 'FULL_AI', fullAi: true, dedMode: 'FULL_AI' })),
    JSON.stringify({ mode: 'FULL_AI', policy: 'FULL_AI', fullAi: true }));
  eq('draft baru EZRAB_AI: mode tersimpan menang',
    JSON.stringify(resolveDraftMode({ policy: 'DATABASE', fullAi: false, dedMode: 'EZRAB_AI' })),
    JSON.stringify({ mode: 'EZRAB_AI', policy: 'DATABASE', fullAi: false }));
  eq('draft lama standar+DATABASE (tanpa mode): diturunkan → EZRAB_AI',
    JSON.stringify(resolveDraftMode({ policy: 'DATABASE' })),
    JSON.stringify({ mode: 'EZRAB_AI', policy: 'DATABASE', fullAi: false }));
  eq('draft lama standar+FULL_AI (tanpa mode): EZRAB_AI + policy FULL_AI dipertahankan',
    JSON.stringify(resolveDraftMode({ policy: 'FULL_AI', fullAi: false })),
    JSON.stringify({ mode: 'EZRAB_AI', policy: 'FULL_AI', fullAi: false }));
  eq('draft lama tanpa apa pun: default C2 + policy lama',
    JSON.stringify(resolveDraftMode({})),
    JSON.stringify({ mode: 'EZRAB_AI', policy: 'FULL_AI', fullAi: false }));
  eq('draft Full AI tanpa dedMode: fullAi=true → FULL_AI',
    JSON.stringify(resolveDraftMode({ policy: 'FULL_AI', fullAi: true })),
    JSON.stringify({ mode: 'FULL_AI', policy: 'FULL_AI', fullAi: true }));
  eq('depthModeFromFullAi(FAST)', depthModeFromFullAi('FAST'), 'FAST');
  eq('depthModeFromFullAi(ADVANCED) → DETAIL', depthModeFromFullAi('ADVANCED'), 'DETAIL');
}

// ================================================================ (d) §4 A–D
section('(d) Aturan kanonik §4 A–D — data + guard');
{
  eq('persis 4 aturan kanonis', DED_KNOWLEDGE_RULES.length, 4);
  eq('id aturan A–D berurutan',
    DED_KNOWLEDGE_RULES.map((r) => r.id).join(''), 'ABCD');
  check('setiap aturan punya judul + pernyataan tak kosong',
    DED_KNOWLEDGE_RULES.every((r) => r.title.length > 0 && r.statement.length > 20));
  eq('knowledgeRule(B) = Isolasi', knowledgeRule('B').title, 'Isolasi FULL AI MODE');
  assert.throws(() => knowledgeRule('X' as never), /tak dikenal/);
  check('knowledgeRule menolak id tak dikenal', true);
  // Guard B — isolasi.
  eq('B: EZRAB_AI boleh memakai katalog kanonis', canUseCanonicalCatalog('EZRAB_AI'), true);
  eq('B: FULL_AI TIDAK boleh memakai katalog kanonis', canUseCanonicalCatalog('FULL_AI'), false);
  eq('B: EZRAB_AI boleh memakai harga internal', canUseInternalPriceData('EZRAB_AI'), true);
  eq('B: FULL_AI TIDAK boleh memakai harga internal', canUseInternalPriceData('FULL_AI'), false);
  // Guard C — kontrak output.
  const cEz = outputContractForMode('EZRAB_AI');
  const cFull = outputContractForMode('FULL_AI');
  eq('C: total dihitung canonical-engine (kedua mode)',
    `${cEz.totalsComputedBy}/${cFull.totalsComputedBy}`, 'canonical-engine/canonical-engine');
  eq('C: total usulan AI hanya perbandingan (kedua mode)',
    `${cEz.aiTotalsRole}/${cFull.aiTotalsRole}`, 'comparison-only/comparison-only');
  eq('C: unresolved = null (kedua mode)',
    `${cEz.unresolvedValue}/${cFull.unresolvedValue}`, 'null/null');
  eq('C: estimasi berlabel (kedua mode)',
    `${cEz.estimatesLabelled}/${cFull.estimatesLabelled}`, 'true/true');
  eq('C: harga kanonis hanya di EZRAB_AI',
    `${cEz.allowsCanonicalPrices}/${cFull.allowsCanonicalPrices}`, 'true/false');
  // Guard D — engine finansial kanonis.
  eq('D: kedua mode memakai engine kanonis yang sama',
    `${financialEngineForMode('EZRAB_AI')}/${financialEngineForMode('FULL_AI')}`, 'canonical/canonical');
  eq('D: konstanta engine', CANONICAL_FINANCIAL_ENGINE, 'canonical');
  check('D: isCanonicalFinancialEngine',
    isCanonicalFinancialEngine('canonical') && !isCanonicalFinancialEngine('ai-total') && !isCanonicalFinancialEngine(null));
  // A — baris mode konteks.
  const lineEz = describeModeForContext('EZRAB_AI', 'DATABASE');
  check('A: baris mode EZRAB_AI menyebut mode+policy+mesin',
    lineEz.includes('EZRAB AI') && lineEz.includes('DATABASE') && lineEz.includes('mesin standar'));
  const lineFull = describeModeForContext('FULL_AI', 'FULL_AI');
  check('A: baris mode FULL_AI menyebut mode+policy+mesin',
    lineFull.includes('Full AI') && lineFull.includes('FULL_AI') && lineFull.includes('mesin Full AI'));
  const lineHybrid = describeModeForContext('EZRAB_AI', 'FULL_AI');
  check('A: hibrida lama ditulis jujur (mode EZRAB AI + policy FULL_AI)',
    lineHybrid.includes('EZRAB AI') && lineHybrid.includes('FULL_AI'));
  eq('A: policy tak diisi → diambil dari mode (C1)',
    describeModeForContext('FULL_AI'), describeModeForContext('FULL_AI', 'FULL_AI'));
}

// ================================================================ (e) G-ST-1
section('(e) G-ST-1 — mode/policy bertahan lewat lampiran DED');
{
  const outDb = dedOutput('DATABASE');
  const attachedDb = attachDedToProject('proj-w1-db', outDb);
  eq('attach DATABASE ok', attachedDb.ok, true);
  eq('lampiran DATABASE membawa policy DATABASE', attachedDb.attachment?.policy, 'DATABASE');
  eq('lampiran DATABASE membawa dedMode EZRAB_AI', attachedDb.attachment?.dedMode, 'EZRAB_AI');
  const outFull = dedOutput('FULL_AI');
  const attachedFull = attachDedToProject('proj-w1-full', outFull);
  eq('attach FULL_AI ok', attachedFull.ok, true);
  eq('lampiran FULL_AI membawa policy FULL_AI', attachedFull.attachment?.policy, 'FULL_AI');
  eq('lampiran FULL_AI (mesin standar) membawa dedMode EZRAB_AI — hibrida lama',
    attachedFull.attachment?.dedMode, 'EZRAB_AI');
  // Round-trip lewat storage stub.
  const loaded = loadDedAttachment('proj-w1-db');
  eq('loadDedAttachment mengembalikan lampiran DATABASE', loaded?.policy, 'DATABASE');
  eq('loadDedAttachment mempertahankan dedMode', loaded?.dedMode, 'EZRAB_AI');
  // Rekonstruksi: policy ASAL diteruskan (bukan hardcode FULL_AI).
  const reconDb = attachmentToDedOutput(attachedDb.attachment!);
  eq('attachmentToDedOutput(DATABASE) → policy DATABASE (bukan hardcode)',
    reconDb.policy, 'DATABASE');
  const reconFull = attachmentToDedOutput(attachedFull.attachment!);
  eq('attachmentToDedOutput(FULL_AI) → policy FULL_AI', reconFull.policy, 'FULL_AI');
  // Lampiran lama tanpa policy → FULL_AI (backward compat, perilaku lama).
  const legacyAtt = { ...attachedDb.attachment!, policy: undefined, dedMode: undefined } as DedAttachment;
  delete (legacyAtt as unknown as Record<string, unknown>).policy;
  delete (legacyAtt as unknown as Record<string, unknown>).dedMode;
  eq('lampiran lama tanpa policy → FULL_AI (backward compat)',
    attachmentToDedOutput(legacyAtt).policy, 'FULL_AI');
  // Penjaga sumber: hardcode lama sudah hilang.
  const integSrc = readSrc('ai-tools/ezrab-ai/dedQtoIntegration.ts');
  check('tidak ada lagi hardcode policy FULL_AI di attachmentToDedOutput',
    !/policy: 'FULL_AI',/.test(integSrc));
  check('DedAttachment mendeklarasikan policy + dedMode',
    integSrc.includes('policy?: DedEstimationPolicy') && integSrc.includes('dedMode?: DedRabAiMode'));
}

// ================================================================ (f) G-ST-2
section('(f) G-ST-2 — draft mempertahankan mode; hasil Full AI bisa didraft');
{
  const viewSrc = readSrc('ai-tools/ded-ai-estimate/view.tsx');
  check('DraftRecord menyimpan policy', viewSrc.includes('policy?: DedEstimationPolicy;'));
  check('DraftRecord menyimpan fullAi', viewSrc.includes('fullAi?: boolean;'));
  check('DraftRecord menyimpan dedMode', viewSrc.includes('dedMode?: DedRabAiMode;'));
  check('DraftRecord membawa fullAiOutput opsional', viewSrc.includes('fullAiOutput?: FullAiOutput;'));
  check('DraftRecord.output kini opsional (draft Full AI tanpa output standar)',
    viewSrc.includes('output?: DedAiOutput;'));
  check('handleSaveFullAiDraft ada (hasil Full AI bisa disimpan)',
    viewSrc.includes('const handleSaveFullAiDraft'));
  check('handleSaveFullAiDraft menandai fullAi:true + dedMode FULL_AI',
    viewSrc.includes('fullAi: true,') && viewSrc.includes("dedMode: 'FULL_AI',"));
  check('handleLoadDraft memakai resolveDraftMode (satu logika restore)',
    viewSrc.includes('resolveDraftMode({'));
  check('handleLoadDraft memulihkan fullAiOutput bila ada',
    viewSrc.includes('setFullAiOutput(d.fullAiOutput)'));
  check('handleLoadDraft membersihkan fullAiOutput saat memuat draft standar',
    viewSrc.includes('setFullAiOutput(null)'));
  check('handleLoadDraft memulihkan fullAi ke sesi',
    viewSrc.includes('fullAi: restored.fullAi'));
  check('daftar draft membaca grandTotal/itemCount dari fullAiOutput bila ada',
    viewSrc.includes('d.fullAiOutput?.items.length') && viewSrc.includes('d.fullAiOutput?.grandTotal'));
  check('view meneruskan onSaveDraft ke FullAiResultView',
    viewSrc.includes('onSaveDraft={handleSaveFullAiDraft}'));
  const fullViewSrc = readSrc('ai-tools/ded-full-ai/FullAiResultView.tsx');
  check('FullAiResultView menerima prop onSaveDraft opsional',
    fullViewSrc.includes('onSaveDraft?: (items: FullAiItem[]) => void;'));
  check('FullAiResultView menampilkan tombol Simpan Draft bila prop ada',
    fullViewSrc.includes("onSaveDraft && (") && fullViewSrc.includes('Simpan Draft'));
}

// ================================================================ (g) G-KN-1/2
section('(g) G-KN-1/G-KN-2 — seksi DED sadar mode');
{
  // buildDedSection: rantai hidup attachment→output→seksi membawa mode.
  const sectionDb = buildDedSection(dedOutput('DATABASE'));
  check('buildDedSection(DATABASE) memuat baris mode EZRAB AI',
    sectionDb.includes('Mode DED: EZRAB AI'));
  check('buildDedSection(DATABASE) memuat policy DATABASE',
    sectionDb.includes('DATABASE'));
  check('buildDedSection tetap memuat Pemahaman DED',
    sectionDb.includes('Pemahaman DED'));
  const sectionFull = buildDedSection(dedOutput('FULL_AI'));
  check('buildDedSection(FULL_AI) memuat baris mode + policy FULL_AI',
    sectionFull.includes('Mode DED: EZRAB AI') && sectionFull.includes('FULL_AI'));
  // extractSpecs membawa mode/policy.
  const extracted = extractSpecsFromDedOutput(dedOutput('DATABASE'));
  eq('extractSpecs membawa policy DATABASE', extracted.policy, 'DATABASE');
  eq('extractSpecs membawa dedMode EZRAB_AI', extracted.dedMode, 'EZRAB_AI');
  // Tanpa mode: format lama dipertahankan (tanpa baris mode).
  const legacyLines = formatDedUnderstandingLines({
    specs: [], missingData: [], insufficientDivisions: [],
    coverage: { totalItems: 0, itemsWithQuantity: 0, itemsWithPrice: 0, itemsFullyResolved: 0, itemsUnresolved: 0, partial: false },
  });
  check('hasil tanpa mode: baris pertama tetap Pemahaman DED (tanpa baris mode)',
    legacyLines[0].startsWith('Pemahaman DED') && !legacyLines.some((l) => l.startsWith('Mode DED:')));

  // Builder kanonis: stempel mode bila dibawa; tanpa mode = tak berubah.
  const fakeSection = 'Pemahaman DED: 1/1 item ter-resolver penuh.';
  const base = {
    userId: null, projectId: 'proj-w1', conversationId: 'conv-w1',
    messages: [{ role: 'user' as const, content: 'Berapa spek beton dari DED?' }],
    dedSection: fakeSection,
  };
  const withMode = buildCanonicalContext({ ...base, dedMode: 'FULL_AI', dedPolicy: 'FULL_AI' });
  check('builder menstempel baris mode FULL_AI di blok data',
    withMode.dataBlock.includes('Mode DED: Full AI') && withMode.dataBlock.includes('FULL_AI'));
  eq('pin anggaran DED 800 tetap saat seksi + mode ada',
    withMode.report.budget.ded, 800);
  eq('pin seksi DED included=1 tetap', withMode.report.sections.ded.included, 1);
  const withPolicyOnly = buildCanonicalContext({ ...base, dedPolicy: 'DATABASE' });
  check('hanya policy DATABASE → mode diturunkan EZRAB_AI + policy DATABASE',
    withPolicyOnly.dataBlock.includes('Mode DED: EZRAB AI') && withPolicyOnly.dataBlock.includes('DATABASE'));
  const withoutMode = buildCanonicalContext({ ...base });
  check('tanpa dedMode/dedPolicy: blok data TIDAK memuat baris mode (backward compat)',
    !withoutMode.dataBlock.includes('Mode DED:'));
  check('tanpa dedMode/dedPolicy: seksi DED tetap tampil',
    withoutMode.dataBlock.includes('PEMAHAMAN DED') && withoutMode.dataBlock.includes('1/1 item ter-resolver penuh'));
  eq('tanpa mode: anggaran DED tetap 800 (pin Fase 1)',
    withoutMode.report.budget.ded, 800);
  // prompt.ts TIDAK disentuh (system prompt ter-pin SHA) — penjaga.
  const promptSrc = readSrc('ai-tools/ezrab-ai/prompt.ts');
  check('prompt.ts tidak menyebut mode DED (ter-pin; mode lewat seksi konteks)',
    !promptSrc.includes('DedRabAiMode') && !promptSrc.includes('dedMode'));
}

// ---------------------------------------------------------------- ringkasan
console.log(`\nw1DedMode: ${passed} PASS / ${failed} FAIL / ${passed + failed} TOTAL`);
if (failed > 0) {
  console.log(`Gagal: ${failures.join(' | ')}`);
  process.exitCode = 1;
}

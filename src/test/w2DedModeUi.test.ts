/**
 * W2 — DED-RAB AI DUAL MODE: UI PEMILIHAN MODE (§3 directive).
 * Suite plain-tsx (gaya dedPromptModeSeparation.src.ts): tanpa render
 * React, tanpa panggilan provider, tanpa tsc/build. Dijalankan:
 *   npx tsx src/test/w2DedModeUi.test.ts
 *
 * Cakupan: G-UI-1 (persis 2 kartu mode), G-UI-2 (label lama lenyap),
 * G-UI-3 (pemeta Full AI → lampiran Chat AI), G-UI-4 (kompleksitas ke
 * mesin Full AI — metadata usage, BUKAN metering: featureKey tidak
 * berubah). Default sesi baru EZRAB_AI (C2); mode bertahan lewat
 * session; ganti mode tidak membocorkan konfigurasi eksekusi.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  DED_RAB_AI_MODES,
  DEFAULT_DED_RAB_AI_MODE,
  engineForMode,
  modeFromLegacy,
  modeLabel,
  policyForMode,
} from '../ai-tools/ded-ai-estimate/dedMode';
import {
  DEFAULT_DED_AI_MODE,
  DED_MODE_CARDS,
  buildFullAiAttachmentOutput,
  dedModeFieldsFor,
  mapFullAiItemToDedAiItem,
  resolveDedAiMode,
  withDedMode,
} from '../ai-tools/ded-ai-estimate/dedModeUi';
import { buildDedUsageFromFullAi } from '../ai-tools/ded-ai-estimate/usageMetadata';
import type { FullAiItem, FullAiOutput } from '../ai-tools/ded-full-ai/types';

let pass = 0, fail = 0;
const fails: string[] = [];
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; } else { fail++; fails.push(name); console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}

function findRepoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, 'api/_lib/featureBillingMatrix.js'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return dir;
}
const root = findRepoRoot();
const src = (rel: string) => readFileSync(join(root, rel), 'utf8');

console.log('=== W2 DED Mode UI (§3) ===');

// ---------------------------------------------------------------- 1. Persis 2 mode
console.log('-- 1. Persis dua kartu mode (G-UI-1) --');
check('1a tepat 2 kartu mode', DED_MODE_CARDS.length === 2, `got ${DED_MODE_CARDS.length}`);
check('1b urutan kartu EZRAB_AI lalu FULL_AI',
  DED_MODE_CARDS[0]?.mode === 'EZRAB_AI' && DED_MODE_CARDS[1]?.mode === 'FULL_AI');
check('1c kartu = mode kanonis W1 (DED_RAB_AI_MODES)',
  DED_MODE_CARDS.map((c) => c.mode).join(',') === [...DED_RAB_AI_MODES].join(','));
const ezCard = DED_MODE_CARDS[0]!;
const faCard = DED_MODE_CARDS[1]!;
check('1d kartu 1 judul + subjudul persis',
  ezCard.title === 'EZRAB AI MODE' && ezCard.subtitle === 'Analisis cerdas dengan referensi EZRAB');
check('1e kartu 2 judul + subjudul persis',
  faCard.title === 'FULL AI MODE' && faCard.subtitle === 'AI membangun analisis konstruksi secara mandiri');
check('1f kartu 1 lima butir, menyebut database AHSP EZRAB',
  ezCard.bullets.length === 5 && ezCard.bullets.includes('Terintegrasi database AHSP EZRAB')
  && ezCard.bullets.includes('Calculation engine EZRAB'));
check('1g kartu 2 enam butir, menyatakan TIDAK memakai database AHSP internal',
  faCard.bullets.length === 6 && faCard.bullets.includes('TIDAK memakai database referensi AHSP internal')
  && faCard.bullets.includes('AI menyusun WBS + pekerjaan')
  && faCard.bullets.includes('AI menghasilkan koefisien + estimasi harga'));
check('1h aksen berbeda: EZRAB biru, Full AI violet',
  ezCard.accent === 'blue' && faCard.accent === 'violet');
check('1i catatan keterbukaan ada di kedua kartu; Full AI menyebut bukan harga resmi AHSP',
  ezCard.note.length > 0 && faCard.note.includes('bukan harga resmi AHSP'));

// ------------------------------------------------- 2. Pemetaan mode → (policy, mesin)
console.log('-- 2. Pemetaan mode → (policy, mesin) --');
check('2a policyForMode EZRAB_AI = DATABASE', policyForMode('EZRAB_AI') === 'DATABASE');
check('2b policyForMode FULL_AI = FULL_AI', policyForMode('FULL_AI') === 'FULL_AI');
check('2c engineForMode EZRAB_AI = STANDARD', engineForMode('EZRAB_AI') === 'STANDARD');
check('2d engineForMode FULL_AI = FULL_AI', engineForMode('FULL_AI') === 'FULL_AI');
const ezFields = dedModeFieldsFor('EZRAB_AI');
check('2e dedModeFieldsFor EZRAB_AI = (DATABASE, standar)',
  ezFields.dedMode === 'EZRAB_AI' && ezFields.policy === 'DATABASE' && ezFields.fullAi === false);
const faFields = dedModeFieldsFor('FULL_AI');
check('2f dedModeFieldsFor FULL_AI = (FULL_AI, Full AI)',
  faFields.dedMode === 'FULL_AI' && faFields.policy === 'FULL_AI' && faFields.fullAi === true);
check('2g modeLabel berbeda per mode, tanpa kata "Estimasi"',
  modeLabel('EZRAB_AI') === 'EZRAB AI' && modeLabel('FULL_AI') === 'Full AI');

// ------------------------------------------------------------ 3. Default sesi baru
console.log('-- 3. Default sesi baru = EZRAB_AI (C2) --');
check('3a DEFAULT_DED_AI_MODE = EZRAB_AI', DEFAULT_DED_AI_MODE === 'EZRAB_AI');
check('3b default UI = default kanonis W1', DEFAULT_DED_AI_MODE === DEFAULT_DED_RAB_AI_MODE);
const freshDefault = withDedMode({}, 'EZRAB_AI');
check('3c sesi baru default: policy DATABASE + mesin standar',
  freshDefault.dedMode === 'EZRAB_AI' && freshDefault.policy === 'DATABASE' && freshDefault.fullAi === false);
check('3d tanpa sinyal apa pun → default C2 (EZRAB_AI)', resolveDedAiMode({}) === 'EZRAB_AI');

// ------------------------------------------------------- 4. Mode bertahan lewat session
console.log('-- 4. Mode bertahan lewat session --');
const baseSession = {
  files: [] as unknown[], description: '', projectName: 'P',
  projectType: 'BANGUNAN' as const, mode: 'DETAIL' as const,
  targetProjectId: null, complexity: 'complex' as const,
};
const fullAiSession = withDedMode(baseSession, 'FULL_AI');
check('4a sesi FULL_AI: resolve kembali FULL_AI', resolveDedAiMode(fullAiSession) === 'FULL_AI');
const ezSession = withDedMode(baseSession, 'EZRAB_AI');
check('4b sesi EZRAB_AI: resolve kembali EZRAB_AI', resolveDedAiMode(ezSession) === 'EZRAB_AI');
check('4c dedMode tersimpan menang atas field legasi yang bertentangan',
  resolveDedAiMode({ dedMode: 'FULL_AI', policy: 'DATABASE', fullAi: false }) === 'FULL_AI'
  && resolveDedAiMode({ dedMode: 'EZRAB_AI', policy: 'FULL_AI', fullAi: true }) === 'EZRAB_AI');
check('4d legasi kanonis (DATABASE, standar) → EZRAB_AI',
  modeFromLegacy({ policy: 'DATABASE', fullAi: false }) === 'EZRAB_AI');
check('4e legasi kanonis (FULL_AI, Full AI) → FULL_AI',
  modeFromLegacy({ policy: 'FULL_AI', fullAi: true }) === 'FULL_AI');
check('4f hibrida lama (mesin standar + policy FULL_AI, default lama) → EZRAB_AI (mesin menang)',
  modeFromLegacy({ policy: 'FULL_AI', fullAi: false }) === 'EZRAB_AI');

// ------------------------------------------- 5. Ganti mode tidak membocorkan konfigurasi
console.log('-- 5. Ganti mode tidak membocorkan konfigurasi eksekusi --');
const switchedToEz = withDedMode(fullAiSession, 'EZRAB_AI');
check('5a FULL_AI → EZRAB_AI: policy FULL_AI lama TIDAK terbawa',
  switchedToEz.policy === 'DATABASE' && switchedToEz.fullAi === false && switchedToEz.dedMode === 'EZRAB_AI');
const switchedToFa = withDedMode(ezSession, 'FULL_AI');
check('5b EZRAB_AI → FULL_AI: policy DATABASE lama TIDAK terbawa',
  switchedToFa.policy === 'FULL_AI' && switchedToFa.fullAi === true && switchedToFa.dedMode === 'FULL_AI');
check('5c ganti mode mempertahankan kedalaman (DETAIL) di kedua arah',
  switchedToEz.mode === 'DETAIL' && switchedToFa.mode === 'DETAIL');
check('5d ganti mode mempertahankan kompleksitas + tipe proyek + berkas',
  switchedToEz.complexity === 'complex' && switchedToFa.complexity === 'complex'
  && switchedToEz.projectType === 'BANGUNAN' && switchedToEz.files === baseSession.files);
const roundTrip = withDedMode(withDedMode(fullAiSession, 'EZRAB_AI'), 'FULL_AI');
check('5e ganti bolak-balik kembali ke medan mode semula persis',
  roundTrip.dedMode === 'FULL_AI' && roundTrip.policy === 'FULL_AI' && roundTrip.fullAi === true);

// ------------------------------------------------------- 6. G-UI-3 pemeta lampiran
console.log('-- 6. G-UI-3 pemeta Full AI → lampiran Chat AI --');
const mkItem = (over: Partial<FullAiItem>): FullAiItem => ({
  id: 'it-1', no: 1, name: 'Galian tanah', category: 'Pekerjaan Tanah',
  quantity: { value: 10, unit: 'm3', provenance: 'EXPLICIT', confidence: 'HIGH' },
  price: { unitPrice: 50000, unit: 'm3', source: 'AI_ESTIMATE' },
  subtotal: 500000, subtotalVerified: true, status: 'READY', exclusionReason: null,
  ...over,
});
const mapped = mapFullAiItemToDedAiItem(mkItem({}));
check('6a kuantitas + harga + subtotal dipertahankan persis',
  mapped.quantity === 10 && mapped.unitPrice === 50000 && mapped.subtotal === 500000
  && mapped.units === 'm3' && mapped.name === 'Galian tanah');
const provCases: Array<[FullAiItem['quantity']['provenance'], string]> = [
  ['EXPLICIT', 'DED_EXPLICIT'], ['DERIVED', 'DERIVED'], ['ASSUMPTION', 'ASSUMPTION'],
  ['USER_INPUT', 'USER_INPUT'], ['NEEDS_CONFIRMATION', 'AI_INFERENCE'], ['UNRESOLVED', 'UNRESOLVED'],
];
for (const [from, to] of provCases) {
  const m = mapFullAiItemToDedAiItem(mkItem({ quantity: { value: 1, unit: 'm3', provenance: from, confidence: 'HIGH' } }));
  check(`6b provenance ${from} → ${to}`, m.quantitySource === to, `got ${m.quantitySource}`);
}
check('6c AHSP_2026 + ahspCode dipertahankan',
  (() => {
    const m = mapFullAiItemToDedAiItem(mkItem({ price: { unitPrice: 1, unit: 'm3', source: 'AHSP_2026', ahspCode: '1.2.3' } }));
    return m.priceSource === 'AHSP_2026' && m.ahspCode === '1.2.3';
  })());
check('6d VERIFIED_SOURCE warisan diturunkan ke AI_ESTIMATE, TIDAK PERNAH jadi AHSP_2026',
  (() => {
    const m = mapFullAiItemToDedAiItem(mkItem({ price: { unitPrice: 1, unit: 'm3', source: 'VERIFIED_SOURCE', ahspCode: '9.9.9' } }));
    return m.priceSource === 'AI_ESTIMATE' && m.ahspCode === undefined;
  })());
check('6e USER_INPUT + UNRESOLVED dipertahankan',
  mapFullAiItemToDedAiItem(mkItem({ price: { unitPrice: 1, unit: 'm3', source: 'USER_INPUT' } })).priceSource === 'USER_INPUT'
  && mapFullAiItemToDedAiItem(mkItem({ price: { unitPrice: null, unit: 'm3', source: 'UNRESOLVED' } })).priceSource === 'UNRESOLVED');
check('6f null tetap null; tanpa subtotal → stage PRICING (bukan CALCULATED)',
  (() => {
    const m = mapFullAiItemToDedAiItem(mkItem({
      quantity: { value: null, unit: 'm3', provenance: 'UNRESOLVED', confidence: 'LOW' },
      price: { unitPrice: null, unit: 'm3', source: 'UNRESOLVED' },
      subtotal: null, subtotalVerified: false, status: 'UNRESOLVED',
    }));
    return m.quantity === null && m.unitPrice === null && m.subtotal === null && m.stage === 'PRICING';
  })());
check('6g subtotal terhitung → stage CALCULATED', mapped.stage === 'CALCULATED');
check('6h rumus + dimensi + halaman dipertahankan sebagai bukti',
  (() => {
    const m = mapFullAiItemToDedAiItem(mkItem({
      quantity: { value: 2, unit: 'm3', formula: '2 x 1 x 1', dimensions: '2x1x1', sourcePages: [3], provenance: 'DERIVED', confidence: 'HIGH' },
      sourcePages: [3, 4],
    }));
    return m.quantityFormula === '2 x 1 x 1' && m.rawDimensions === '2x1x1'
      && m.sourcePages.join(',') === '3,4';
  })());

const faOutput = {
  success: true, mode: 'ADVANCED', policy: 'FULL_AI',
  projectInfo: { projectType: 'BANGUNAN', scopeSummary: '' },
  items: [], grandTotal: 500000, summary: {}, warnings: [],
  provenance: { provider: null, model: null, timeoutLimitMs: 1, timestamp: '', documentPages: 7, documentChars: 100 },
} as unknown as FullAiOutput;
const attached = buildFullAiAttachmentOutput(
  faOutput,
  [mkItem({}), mkItem({ id: 'it-2', subtotal: null, subtotalVerified: false, status: 'UNRESOLVED' })],
  { projectName: 'Proyek X', projectType: 'BANGUNAN', mode: 'DETAIL', fileName: 'ded.pdf' },
);
check('6i attachment: grandTotal hanya dari subtotal positif (500000)',
  attached.grandTotal === 500000, `got ${attached.grandTotal}`);
check('6j attachment: coverage dihitung dari item yang diteruskan',
  attached.coverage.totalItems === 2 && attached.coverage.itemsWithQuantity === 2
  && attached.coverage.itemsWithPrice === 2 && attached.coverage.itemsUnresolved === 0);
check('6k attachment: partial true bila ada item tanpa subtotal', attached.partial === true);
check('6l attachment: policy + halaman + nama proyek dibawa',
  attached.policy === 'FULL_AI' && attached.pageCount === 7
  && attached.projectName === 'Proyek X' && attached.fileName === 'ded.pdf' && attached.mode === 'DETAIL');

// ------------------------------------------------- 7. G-UI-4 kompleksitas → Full AI
console.log('-- 7. G-UI-4 kompleksitas ke mesin Full AI (metadata, bukan metering) --');
const faUsageSource = {
  provenance: { provider: 'x', model: 'y' }, items: [], fileName: 'f.pdf', productId: 'DED_AI_DETAIL',
};
const uComplex = buildDedUsageFromFullAi(faUsageSource as never, { workflowId: 'wf-w2a', policy: 'FULL_AI', complexity: 'complex' });
check('7a Full AI + complexity complex → tercatat complex',
  uComplex.complexity === 'complex', `got ${uComplex.complexity}`);
check('7b featureKey TETAP ded-ai/full-ai (metering tidak berubah)',
  uComplex.featureKey === 'ded-ai/full-ai', `got ${uComplex.featureKey}`);
const uAbsent = buildDedUsageFromFullAi(faUsageSource as never, { workflowId: 'wf-w2b', policy: 'FULL_AI' });
check('7c Full AI tanpa complexity → null eksplisit (bukan default)',
  uAbsent.complexity === null, `got ${uAbsent.complexity}`);
check('7d featureKey tanpa complexity tetap ded-ai/full-ai',
  uAbsent.featureKey === 'ded-ai/full-ai');

// --------------------------------------------- 8. G-UI-2 label lama lenyap (statis)
console.log('-- 8. G-UI-2 label lama lenyap dari permukaan DED (statis) --');
const inputView = src('src/ai-tools/ded-ai-estimate/DedAiInputView.tsx');
check('8a InputView: tanpa label "Estimasi Full AI"', !inputView.includes('Estimasi Full AI'));
check('8b InputView: tanpa label "Estimasi Database EZRAB"', !inputView.includes('Estimasi Database EZRAB'));
check('8c InputView: tanpa label "Full AI Estimate"', !inputView.includes('Full AI Estimate'));
check('8d InputView: tanpa state policy/mesin terpisah (setPolicy/setFullAi)',
  !inputView.includes('setPolicy(') && !inputView.includes('setFullAi('));
check('8e InputView: memakai kartu mode + kelas dedai-modecard',
  inputView.includes('DED_MODE_CARDS') && inputView.includes('dedai-modecard'));
const viewSrc = src('src/ai-tools/ded-ai-estimate/view.tsx');
check('8f view: tanpa label "Estimasi Full AI"', !viewSrc.includes('Estimasi Full AI'));
check('8g view: tanpa label "Estimasi Database EZRAB"', !viewSrc.includes('Estimasi Database EZRAB'));
check('8h view: tanpa chip "Full AI Estimate"', !viewSrc.includes('Full AI Estimate'));
check('8i view: dispatch pada mode kanonis + policy dari policyForMode',
  viewSrc.includes('resolveDedAiMode(sess)') && viewSrc.includes('policyForMode(aiMode)')
  && !viewSrc.includes('if (sess.fullAi)'));
check('8j view: chip memakai modeLabel kanonis', viewSrc.includes('modeLabel(shellMode)'));
const fullAiView = src('src/ai-tools/ded-full-ai/FullAiResultView.tsx');
check('8k FullAiResultView: tombol "Kirim ke Chat AI" + prop onSendToChat',
  fullAiView.includes('Kirim ke Chat AI') && fullAiView.includes('onSendToChat'));
const css = src('src/ai-tools/ded-ai-estimate/dedAi.css');
check('8l CSS: gaya kartu mode + tumpuk satu kolom di layar sempit',
  css.includes('.dedai-modecard') && css.includes('.dedai-modecard.violet.selected')
  && css.includes('@media (max-width: 720px)'));

console.log(`\n=== HASIL: ${pass} PASS, ${fail} FAIL ===`);
if (fail > 0) process.exit(1);

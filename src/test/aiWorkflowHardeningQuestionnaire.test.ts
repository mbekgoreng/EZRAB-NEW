/**
 * EZRAB AI WORKFLOW HARDENING, FINAL LOCAL EXECUTION — Worker C, gap C-P1
 * (2026-11-26, owner decision: APPROVE).
 *
 * Questionnaire def 'bridge-span' (questionnaire.ts) used to treat total
 * length as satisfying the span question:
 *   isSatisfied: hasAnswer(c, 'bridge-span') || c.spanM != null || c.lengthM != null
 * so a user who deflected the span question was never asked it again by
 * the questionnaire either. One-line fix:
 *   isSatisfied: hasAnswer(c, 'bridge-span') || c.spanM != null
 *
 * Required behavior pinned here:
 *  - bridge span uses dedicated spanM only; total length uses dedicated
 *    lengthM only; missing span stays missing; never infer span from
 *    total length; never overwrite total length with span; preserve
 *    independent values when both are supplied; ask for missing span
 *    when the workflow requires it.
 *  - Sibling def 'irrigation-length' (|| c.lengthM != null) is CORRECT
 *    and deliberately UNCHANGED — length IS the measure for irrigation.
 *  - Conversational clarification behavior unchanged (regression pins
 *    mirrored from aiWorkflowSprintClarify.test.ts §1 / Worker B 1.11).
 *
 * Jalankan: npx --yes tsx src/test/aiWorkflowHardeningQuestionnaire.test.ts
 * (skrip asersi tsx polos — BUKAN vitest.)
 */
import {
  extractUniversalContext, selectNextQuestion,
} from '../ai-tools/ezrab-ai/universalIntake';
import {
  selectQuestionnaireQuestions, applyQuestionnaireAnswers,
} from '../ai-tools/ezrab-ai/questionnaire';

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; failures.push(name); console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

const ctxOf = (text: string) => extractUniversalContext(text);
const qKeys = (text: string) =>
  selectQuestionnaireQuestions(ctxOf(text)).map((q) => q.key);
const convKey = (text: string) => selectNextQuestion(ctxOf(text))?.key ?? null;

/* ------------------------------------------------------------------ */
/* 1 — Mandatory example A: length 20 m, span null → span requested   */
/* ------------------------------------------------------------------ */
console.log('== 1 — Panjang total 20 m, bentang null → bentang ditanya ==');
{
  const c = ctxOf('buatkan rab jembatan beton panjang 20 m');
  check('1.1 length 20 tercatat', c.lengthM === 20, `length=${c.lengthM}`);
  check('1.2 span tetap null (tidak dikarang dari panjang)', c.spanM == null, `span=${c.spanM}`);
  check('1.3 kuesioner MEMINTA bridge-span', qKeys('buatkan rab jembatan beton panjang 20 m').includes('bridge-span'), qKeys('buatkan rab jembatan beton panjang 20 m').join(', '));
  check('1.4 prompt kuesioner menyebut bentang', (selectQuestionnaireQuestions(c).find((q) => q.key === 'bridge-span')?.prompt ?? '').includes('bentang'));
}

/* ------------------------------------------------------------------ */
/* 2 — Mandatory example B: length 20 m + span 12 m → both kept      */
/* ------------------------------------------------------------------ */
console.log('== 2 — Panjang 20 m + bentang 12 m → keduanya utuh ==');
{
  const c = ctxOf('buatkan rab jembatan bentang 12 m panjang 20 m');
  check('2.1 length 20 tercatat', c.lengthM === 20, `length=${c.lengthM}`);
  check('2.2 span 12 tercatat', c.spanM === 12, `span=${c.spanM}`);
  check('2.3 kuesioner TIDAK lagi meminta bridge-span', !qKeys('buatkan rab jembatan bentang 12 m panjang 20 m').includes('bridge-span'), qKeys('buatkan rab jembatan bentang 12 m panjang 20 m').join(', '));
  // Apply jawaban kuesioner '12 m' pada konteks panjang-20: span terisi,
  // panjang total TIDAK tertimpa.
  const c2 = ctxOf('buatkan rab jembatan beton panjang 20 m');
  applyQuestionnaireAnswers(c2, {
    'bridge-span': { selectedIds: [], customText: '12 m', status: 'answered' },
  });
  check('2.4 apply bridge-span "12 m" → spanM 12', c2.spanM === 12, `span=${c2.spanM}`);
  check('2.5 apply bridge-span → lengthM tetap 20 (tidak tertimpa)', c2.lengthM === 20, `length=${c2.lengthM}`);
  check('2.6 sesudah apply, bridge-span tidak lagi diminta', !selectQuestionnaireQuestions(c2).map((q) => q.key).includes('bridge-span'));
}

/* ------------------------------------------------------------------ */
/* 3 — Mandatory example C: span 12 m, length null → length null      */
/* ------------------------------------------------------------------ */
console.log('== 3 — Bentang 12 m, panjang null → panjang tetap null ==');
{
  const c = ctxOf('buatkan rab jembatan bentang 12 m');
  check('3.1 span 12 tercatat', c.spanM === 12, `span=${c.spanM}`);
  check('3.2 length tetap null (bentang bukan panjang total)', c.lengthM == null, `length=${c.lengthM}`);
  check('3.3 kuesioner TIDAK meminta bridge-span', !qKeys('buatkan rab jembatan bentang 12 m').includes('bridge-span'), qKeys('buatkan rab jembatan bentang 12 m').join(', '));
}

/* ------------------------------------------------------------------ */
/* 4 — Bare bridge + sibling irrigation (unchanged, correct)          */
/* ------------------------------------------------------------------ */
console.log('== 4 — Jembatan tanpa ukuran + irigasi (sibling utuh) ==');
{
  check('4.1 jembatan tanpa ukuran → bridge-span diminta', qKeys('buatkan rab jembatan').includes('bridge-span'), qKeys('buatkan rab jembatan').join(', '));
  check('4.2 jembatan bentang+lebar → bridge-span tidak diminta', !qKeys('buatkan rab jembatan bentang 12 m lebar 7 m').includes('bridge-span'));
  // irrigation-length: length IS the measure — length 800 m satisfies it.
  check('4.3 irigasi tanpa panjang → irrigation-length diminta', qKeys('buatkan rab irigasi').includes('irrigation-length'), qKeys('buatkan rab irigasi').join(', '));
  check('4.4 irigasi panjang 800 m → irrigation-length TIDAK diminta (length = ukuran irigasi)', !qKeys('buatkan rab irigasi panjang 800 m').includes('irrigation-length'), qKeys('buatkan rab irigasi panjang 800 m').join(', '));
  const irg = ctxOf('buatkan rab irigasi panjang 800 m');
  check('4.5 irigasi panjang 800 m → lengthM 800', irg.lengthM === 800, `length=${irg.lengthM}`);
}

/* ------------------------------------------------------------------ */
/* 5 — Regression: conversational bridge path unchanged               */
/* ------------------------------------------------------------------ */
console.log('== 5 — Regresi: jalur percakapan jembatan tidak berubah ==');
{
  check('5.1 panjang 20 m → pertanyaan percakapan = bridge-span', convKey('buatkan rab jembatan beton panjang 20 m') === 'bridge-span', convKey('buatkan rab jembatan beton panjang 20 m'));
  check('5.2 bentang 12 m → pertanyaan percakapan = bridge-width', convKey('buatkan rab jembatan bentang 12 m') === 'bridge-width', convKey('buatkan rab jembatan bentang 12 m'));
  check('5.3 bentang+lebar → pertanyaan percakapan = bridge-type', convKey('buatkan rab jembatan bentang 12 m lebar 7 m') === 'bridge-type', convKey('buatkan rab jembatan bentang 12 m lebar 7 m'));
  const both = ctxOf('buatkan rab jembatan bentang 12 m panjang 20 m');
  check('5.4 bentang 12 + panjang 20 → span 12, length 20 (independen)', both.spanM === 12 && both.lengthM === 20, `span=${both.spanM} length=${both.lengthM}`);
  check('5.5 jembatan tanpa ukuran → pertanyaan percakapan = bridge-span (kritis)', convKey('buatkan rab jembatan beton') === 'bridge-span', convKey('buatkan rab jembatan beton'));
}

console.log(`\n${passed} passed, ${failed} failed${failed ? ' — ' + failures.join(' | ') : ''}`);
if (failed > 0) process.exit(1);

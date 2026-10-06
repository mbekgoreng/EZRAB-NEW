import { intentClassifier } from '../orchestrator/intentClassifier';
import { personalityEngine } from '../orchestrator/personalityEngine';
import { aiOrchestrator } from '../orchestrator/aiOrchestrator';
import { subscriptionDataService } from '../services/extendedDataServices';

function assert(condition: boolean, testName: string, detail?: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${testName} ${detail ? `(${detail})` : ''}`);
    throw new Error(`Assertion failed: ${testName} ${detail ? `(${detail})` : ''}`);
  }
  console.log(`✅ PASS: ${testName}`);
}

export async function runGreetingAndSmallTalkTests(): Promise<void> {
  console.log('\n=============================================================');
  console.log('🤖 RUNNING EZRAB AI CO ASSISTANT GREETING & SMALL TALK SUITE');
  console.log('=============================================================\n');

  // 1. GREETING INTENT TESTS
  console.log('--- 1. Sapaan Umum (Greetings) ---');
  const greetingQueries = [
    'Hai',
    'Halo',
    'Hello',
    'Selamat pagi',
    'Siang',
    'Selamat sore',
    'Selamat malam',
    'Assalamualaikum',
    'Permisi',
    'Test',
    'Tes',
    'Cek',
    'Yo',
    'Hei',
    'P',
    'Ping',
    'Test 1 2 3',
    'localhost'
  ];

  for (const query of greetingQueries) {
    const classified = intentClassifier.classify(query);
    assert(classified.category === 'GREETING', `Query "${query}" classified as GREETING (got ${classified.category})`);
    assert(classified.requiresFunction === false, `Query "${query}" does not require function`);
  }

  // 2. "APA KABAR?" (HOW_ARE_YOU)
  console.log('\n--- 2. "Apa Kabar?" (How Are You) ---');
  const howAreYouQueries = [
    'Apa kabar?',
    'Apakabar?',
    'Bagaimana kabarnya?',
    'Gimana kabarnya?',
    'Kamu apa kabar?',
    'Sehat?',
    'Baik-baik saja?',
    'Lagi ngapain?'
  ];

  for (const query of howAreYouQueries) {
    const classified = intentClassifier.classify(query);
    assert(classified.category === 'HOW_ARE_YOU', `Query "${query}" classified as HOW_ARE_YOU (got ${classified.category})`);
  }

  // 3. IDENTITAS & KEMAMPUAN AI (IDENTITY & CAPABILITY)
  console.log('\n--- 3. Identitas & Kemampuan AI ---');
  assert(intentClassifier.classify('Kamu siapa?').category === 'IDENTITY_QUESTION', '"Kamu siapa?" -> IDENTITY_QUESTION');
  assert(intentClassifier.classify('Siapa kamu?').category === 'IDENTITY_QUESTION', '"Siapa kamu?" -> IDENTITY_QUESTION');
  assert(intentClassifier.classify('Kamu robot?').category === 'IDENTITY_QUESTION', '"Kamu robot?" -> IDENTITY_QUESTION');
  assert(intentClassifier.classify('Kamu bisa apa?').category === 'CAPABILITY_QUESTION', '"Kamu bisa apa?" -> CAPABILITY_QUESTION');
  assert(intentClassifier.classify('Apa yang bisa kamu lakukan?').category === 'CAPABILITY_QUESTION', '"Apa yang bisa kamu lakukan?" -> CAPABILITY_QUESTION');

  // 4. PRODUCT OVERVIEW & BASIC HELP
  console.log('\n--- 4. Product Overview & Basic Help ---');
  assert(intentClassifier.classify('EZRAB itu apa?').category === 'PRODUCT_OVERVIEW', '"EZRAB itu apa?" -> PRODUCT_OVERVIEW');
  assert(intentClassifier.classify('Apa itu EZRAB?').category === 'PRODUCT_OVERVIEW', '"Apa itu EZRAB?" -> PRODUCT_OVERVIEW');
  assert(intentClassifier.classify('Saya bingung mulai dari mana').category === 'BASIC_HELP', '"Saya bingung mulai dari mana" -> BASIC_HELP');
  assert(intentClassifier.classify('Bagaimana cara membuat RAB?').category === 'BASIC_HELP', '"Bagaimana cara membuat RAB?" -> BASIC_HELP');

  // 5. SMALL TALK & BASA-BASI
  console.log('\n--- 5. Small Talk & Basa-Basi ---');
  assert(intentClassifier.classify('Temani saya kerja').category === 'SMALL_TALK', '"Temani saya kerja" -> SMALL_TALK');
  assert(intentClassifier.classify('Lagi sibuk?').category === 'SMALL_TALK', '"Lagi sibuk?" -> SMALL_TALK');
  assert(intentClassifier.classify('Hari ini panas sekali').category === 'SMALL_TALK', '"Hari ini panas sekali" -> SMALL_TALK');
  assert(intentClassifier.classify('Saya belum minum kopi').category === 'SMALL_TALK', '"Saya belum minum kopi" -> SMALL_TALK');

  // 6. SECURITY & PAYMENT SENSITIVE
  console.log('\n--- 6. Security & Payment Sensitive Mapping ---');
  assert(intentClassifier.classify('Apakah data saya aman?').category === 'SECURITY_SENSITIVE', '"Apakah data saya aman?" -> SECURITY_SENSITIVE');
  assert(intentClassifier.classify('Bagaimana cara membayar paket Pro?').category === 'PAYMENT_SENSITIVE', '"Bagaimana cara membayar paket Pro?" -> PAYMENT_SENSITIVE');

  // 7. TIME & DATE QUERIES
  console.log('\n--- 7. Waktu & Tanggal Nyata ---');
  const timeEval = personalityEngine.evaluate('Jam berapa sekarang?');
  assert(timeEval.humorResponse !== undefined && (timeEval.humorResponse.includes('WIB') || timeEval.humorResponse.includes('2026') || timeEval.humorResponse.includes('pukul')), 'Live timestamp returned for time query');

  // 8. ZERO CREDIT CONSUMPTION & ZERO FAKE AUDIT ON GREETING
  console.log('\n--- 8. Zero Credit Deduction on Greeting ---');
  const beforeCredit = subscriptionDataService.getSubscription('ws-default-ezrab').creditBalance;
  const greetingResp = await aiOrchestrator.handleChat({
    workspaceId: 'ws-default-ezrab',
    projectId: 'PRJ-TROPIS-MODERN-01',
    userId: 'test-user',
    message: 'Hai'
  });
  const afterCredit = subscriptionDataService.getSubscription('ws-default-ezrab').creditBalance;

  assert(greetingResp.success === true, 'Greeting handled successfully');
  assert(greetingResp.requires_confirmation === false, 'Greeting requires_confirmation === false');
  assert(greetingResp.toolCallsExecuted.length === 0, 'Zero tool calls executed for greeting');
  assert(beforeCredit === afterCredit, `Zero credits deducted on greeting (before: ${beforeCredit}, after: ${afterCredit})`);
  assert(
    greetingResp.content.includes('EZRAB') ||
    greetingResp.content.includes('Hai') ||
    greetingResp.content.includes('Halo'),
    'Friendly natural greeting returned'
  );

  console.log('\n=============================================================');
  console.log('🎉 ALL GREETING & SMALL TALK TESTS PASSED (100% SUCCESS)');
  console.log('=============================================================\n');
}

// Run directly
runGreetingAndSmallTalkTests().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});

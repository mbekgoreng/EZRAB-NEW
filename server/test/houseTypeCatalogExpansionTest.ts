import { HouseTypeCatalog, HOUSE_TYPE_CATALOG } from '../../src/data/houseTypeCatalog';
import { TemplateResolver } from '../services/templateResolver';
import { WizardStateMachine } from '../services/wizardStateMachine';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  }
  console.log(`✅ PASSED: ${msg}`);
}

export async function runHouseTypeExpansionTests() {
  console.log('===============================================================');
  console.log('🧪 RUNNING HOUSE TYPE CATALOG EXPANSION VERIFICATION SUITE');
  console.log('===============================================================\n');

  const workspaceId = 'ws-test-exp-01';
  const userId = 'user-test-01';
  const projectId = 'proj-test-01';
  const conversationId = 'conv-test-01';

  // 1. "buatkan saya rab rumah" -> all types up to Type 300 available in catalog
  console.log('--- TEST 1: "buatkan saya rab rumah" Catalog Returns All Types Up to 300 ---');
  const resHouse = WizardStateMachine.startSession({
    workspaceId,
    userId,
    projectId,
    conversationId,
    initialQuery: 'buatkan saya rab rumah'
  });
  assert(resHouse.step === 'TEMPLATE_SELECTION', 'Step is TEMPLATE_SELECTION');
  assert(!!resHouse.choices && resHouse.choices.length >= 14, `Choices has ${resHouse.choices?.length} entries (>= 14 required)`);

  const choiceLabels = (resHouse.choices || []).map(c => c.label);
  const choiceIds = (resHouse.choices || []).map(c => c.id);

  // 2. Type 36 tampil
  console.log('--- TEST 2: Type 36 Tampil ---');
  assert(choiceLabels.some(l => l.includes('Type 36')), 'Type 36 exists in choices');

  // 3. Type 45 tampil
  console.log('--- TEST 3: Type 45 Tampil ---');
  assert(choiceLabels.some(l => l.includes('Type 45')), 'Type 45 exists in choices');

  // 4. Type 54 tampil
  console.log('--- TEST 4: Type 54 Tampil ---');
  assert(choiceLabels.some(l => l.includes('Type 54')), 'Type 54 exists in choices');

  // 5. Type 60 tampil
  console.log('--- TEST 5: Type 60 Tampil ---');
  assert(choiceLabels.some(l => l.includes('Type 60')), 'Type 60 exists in choices');

  // 6. Type 70 tampil
  console.log('--- TEST 6: Type 70 Tampil ---');
  assert(choiceLabels.some(l => l.includes('Type 70')), 'Type 70 exists in choices');

  // 7. Type 90 tampil
  console.log('--- TEST 7: Type 90 Tampil ---');
  assert(choiceLabels.some(l => l.includes('Type 90')), 'Type 90 exists in choices');

  // 8. Type 100 tampil
  console.log('--- TEST 8: Type 100 Tampil ---');
  assert(choiceLabels.some(l => l.includes('Type 100')), 'Type 100 exists in choices');

  // 9. Type 120 tampil
  console.log('--- TEST 9: Type 120 Tampil ---');
  assert(choiceLabels.some(l => l.includes('Type 120')), 'Type 120 exists in choices');

  // 10. Type 150 tampil
  console.log('--- TEST 10: Type 150 Tampil ---');
  assert(choiceLabels.some(l => l.includes('Type 150')), 'Type 150 exists in choices');

  // 11. Type 180 tampil
  console.log('--- TEST 11: Type 180 Tampil ---');
  assert(choiceLabels.some(l => l.includes('Type 180')), 'Type 180 exists in choices');

  // 12. Type 200 tampil
  console.log('--- TEST 12: Type 200 Tampil ---');
  assert(choiceLabels.some(l => l.includes('Type 200')), 'Type 200 exists in choices');

  // 13. Type 250 tampil
  console.log('--- TEST 13: Type 250 Tampil ---');
  assert(choiceLabels.some(l => l.includes('Type 250')), 'Type 250 exists in choices');

  // 14. Type 300 tampil
  console.log('--- TEST 14: Type 300 Tampil ---');
  assert(choiceLabels.some(l => l.includes('Type 300')), 'Type 300 exists in choices');

  // 15. Urutan tipe benar secara numerik
  console.log('--- TEST 15: Numeric Sorting Validation ---');
  const allCatalog = HouseTypeCatalog.getAll();
  const numericAreas = allCatalog.filter(c => c.area !== null).map(c => c.area as number);
  for (let i = 0; i < numericAreas.length - 1; i++) {
    assert(numericAreas[i] <= numericAreas[i + 1], `Catalog sorting: ${numericAreas[i]} <= ${numericAreas[i + 1]}`);
  }
  assert(allCatalog[allCatalog.length - 1].categoryGroup === 'CUSTOM', 'Custom house is sorted at the end');

  // 16. Type yang belum memiliki template tidak dapat dihitung secara palsu
  console.log('--- TEST 16: Non-Ready Template Gating (No Fake Calculation) ---');
  const sessionT300 = WizardStateMachine.startSession({
    workspaceId,
    userId,
    projectId,
    conversationId,
    initialQuery: 'buatkan saya rab rumah'
  });
  const resSelect300 = WizardStateMachine.answerStep({
    sessionId: sessionT300.wizardSessionId,
    workspaceId,
    userId,
    choiceId: 'house_t300'
  });
  assert(resSelect300.step === 'TEMPLATE_NOT_READY', 'Type 300 returns TEMPLATE_NOT_READY step');
  assert(resSelect300.message.includes('belum memiliki modul kalkulasi'), 'Message explains calculation module not ready');
  assert(!resSelect300.summary, 'No fake RAB calculation produced for Type 300');

  // 17. Type 36 memilih template HOUSE-T36-1FL
  console.log('--- TEST 17: Type 36 Resolves HOUSE-T36-1FL ---');
  const sessionT36 = WizardStateMachine.startSession({
    workspaceId,
    userId,
    projectId,
    conversationId,
    initialQuery: 'buatkan saya rab rumah'
  });
  const resSelect36 = WizardStateMachine.answerStep({
    sessionId: sessionT36.wizardSessionId,
    workspaceId,
    userId,
    choiceId: 'house_t36_1fl'
  });
  assert(resSelect36.step === 'BASIC_PARAMETER_COLLECTION', 'Type 36 moves to BASIC_PARAMETER_COLLECTION');
  const sessionData36 = WizardStateMachine.getSession(sessionT36.wizardSessionId, workspaceId);
  assert(sessionData36?.templateId === 'HOUSE-T36-1FL', 'Session templateId is HOUSE-T36-1FL');

  // 18. Type 36 2 lantai memilih template HOUSE-T36-2FL jika tersedia
  console.log('--- TEST 18: Type 36 2 Lantai Resolves HOUSE-T36-2FL ---');
  const sessionT36_2 = WizardStateMachine.startSession({
    workspaceId,
    userId,
    projectId,
    conversationId,
    initialQuery: 'buatkan saya rab rumah'
  });
  const resSelect36_2 = WizardStateMachine.answerStep({
    sessionId: sessionT36_2.wizardSessionId,
    workspaceId,
    userId,
    choiceId: 'house_t36_2fl'
  });
  assert(resSelect36_2.step === 'BASIC_PARAMETER_COLLECTION', 'Type 36 2FL moves to BASIC_PARAMETER_COLLECTION');
  const sessionData36_2 = WizardStateMachine.getSession(sessionT36_2.wizardSessionId, workspaceId);
  assert(sessionData36_2?.templateId === 'HOUSE-T36-2FL', 'Session templateId is HOUSE-T36-2FL');

  // 19. Input "RAB rumah type 120" dikenali
  console.log('--- TEST 19: Natural Language "RAB rumah type 120" Recognition ---');
  const nlp120 = HouseTypeCatalog.findFromQuery('RAB rumah type 120');
  assert(nlp120.item?.area === 120, 'NLP finds Type 120 item');
  assert(nlp120.extractedArea === 120, 'Extracted area is 120');

  const resDirect120 = WizardStateMachine.startSession({
    workspaceId,
    userId,
    projectId,
    conversationId,
    initialQuery: 'RAB rumah type 120'
  });
  assert(resDirect120.step === 'TEMPLATE_SELECTION', 'Type 120 route to TEMPLATE_SELECTION with status message');
  assert(resDirect120.title.includes('Type 120'), 'Title mentions Type 120');

  // 20. Input "RAB rumah 2 lantai type 200" meminta atau menetapkan jumlah lantai dengan benar
  console.log('--- TEST 20: Natural Language "RAB rumah 2 lantai type 200" Floor & Area Extraction ---');
  const nlp200 = HouseTypeCatalog.findFromQuery('RAB rumah 2 lantai type 200');
  assert(nlp200.item?.area === 200, 'NLP matches Type 200');
  assert(nlp200.extractedFloors === 2, 'NLP extracts floorCount = 2');
  assert(nlp200.extractedArea === 200, 'NLP extracts buildingArea = 200');

  // 21. Pencarian "Type 300" berhasil
  console.log('--- TEST 21: Search Filter "Type 300" ---');
  const search300Results = HouseTypeCatalog.filter('ALL', 'Type 300');
  assert(search300Results.length >= 1, 'Search for "Type 300" returns at least 1 item');
  assert(search300Results[0].area === 300, 'Search item is Type 300');

  const search150Results = HouseTypeCatalog.filter('MENENGAH', '150');
  assert(search150Results.length >= 1, 'Search for "150" in MENENGAH category succeeds');

  // 22. Pilihan Custom tersedia
  console.log('--- TEST 22: Custom House Available ---');
  const customItem = allCatalog.find(c => c.id === 'house_custom');
  assert(!!customItem, 'house_custom exists in catalog');
  assert(customItem?.disabled === false, 'house_custom is enabled/ready');

  // 23. Semua choice memiliki id dan label yang tidak kosong
  console.log('--- TEST 23: Non-Empty IDs and Labels for All Choices ---');
  for (const choice of resHouse.choices || []) {
    assert(!!choice.id && choice.id.trim().length > 0, `Choice ${choice.id} has non-empty id`);
    assert(!!choice.label && choice.label.trim().length > 0, `Choice ${choice.id} has non-empty label: ${choice.label}`);
    assert(!!choice.value && choice.value.trim().length > 0, `Choice ${choice.id} has non-empty value: ${choice.value}`);
    assert(!!choice.nextStep && choice.nextStep.trim().length > 0, `Choice ${choice.id} has valid nextStep: ${choice.nextStep}`);
  }

  // 24. Renderer contract check: choices include area, floorOptions, readinessStatus
  console.log('--- TEST 24: Renderer Metadata Richness ---');
  const t120Choice = (resHouse.choices || []).find(c => c.label.includes('Type 120'));
  assert(t120Choice !== undefined, 'Type 120 choice exists');
  assert(t120Choice?.area === 120, 'Type 120 has area = 120');
  assert(t120Choice?.disabled === true, 'Type 120 has disabled = true');
  assert(!!t120Choice?.disabledReason, 'Type 120 has disabledReason provided');

  console.log('\n===============================================================');
  console.log('🎉 ALL 24 HOUSE TYPE CATALOG EXPANSION TESTS PASSED PERFECTLY!');
  console.log('===============================================================\n');
}

// Execute test
runHouseTypeExpansionTests().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});

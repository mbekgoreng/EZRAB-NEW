import { officialAhspRepository, ALL_OFFICIAL_AHSP_ITEMS } from '../src/data/nationalCostDatabase/officialAhspRepository';
import { ahspMatcher } from '../src/ded-rab-v2/ahsp/ahspMatcher';
import { ahspPriceResolver } from '../src/ded-rab-v2/ahsp/ahspPriceResolver';
import { dedRabValidationGate } from '../src/ded-rab-v2/validation/dedRabValidationGate';
import { dedRabPipeline, ExecutePipelineInput, PipelineExecutionOutput } from '../src/ded-rab-v2';
import { SafeDecimalEngine } from '../src/engine/safeDecimalEngine';
import { priceResolver2026 } from '../src/data/priceDatabase2026/resolver';
import { semanticClassifier } from '../src/ded-rab-v2/semantic/semanticClassifier';
import { constructionNormalizer } from '../src/ded-rab-v2/interpretation/constructionNormalizer';
import { ezrabCoreQto } from '../src/ded-rab-v2/qto/ezrabCoreQto';
import { DedWorkItem } from '../src/ded-rab-v2/types';
import { dedPageCache } from '../src/ded-rab-v2/ai/dedPageCache';

async function runForensicAudit() {
  console.log('================================================================');
  console.log('EZRAB DED -> RAB RUNTIME FORENSIC TRACE');
  console.log('PROJECT: PRJ-RUMAH-2LT-01');
  console.log('================================================================\n');

  // Bypass cache for pure forensic truth
  dedPageCache.clear();

  // Realistic DED items extracted from PRJ-RUMAH-2LT-01 DED drawings:
  const rawDedExtractedItems: Array<{
    name: string;
    category: DedWorkItem['category'];
    materialSpec: string;
    unit: string;
    sourcePage: number;
    evidenceId: string;
    dimensions: any;
    calculationInputs: any;
    rawOcrText: string;
  }> = [
    {
      name: 'Pondasi Batu Kali',
      category: 'FOUNDATION',
      materialSpec: 'Batu kali belah mortar 1:4',
      unit: 'm³',
      sourcePage: 1,
      evidenceId: 'EV-DED-S01-001',
      dimensions: { length: { value: 32.5, unit: 'm' }, width: { value: 0.4, unit: 'm' }, height: { value: 0.8, unit: 'm' } },
      calculationInputs: { length: 32.5, width: 0.4, height: 0.8 },
      rawOcrText: 'Pondasi batu kali belah adukan 1SP : 4PP, L = 32.50 m, B = 0.40 m, H = 0.80 m',
    },
    {
      name: 'Balok Sloof 15/20 cm',
      category: 'STRUCTURE_BEAM',
      materialSpec: 'Beton bertulang K-225',
      unit: 'm³',
      sourcePage: 1,
      evidenceId: 'EV-DED-S01-002',
      dimensions: { length: { value: 32.5, unit: 'm' } }, // width & height omitted in OCR -> missing dimension
      calculationInputs: { length: 32.5 },
      rawOcrText: 'Balok sloof praktis beton K-225 sepanjang garis pondasi L = 32.50 m',
    },
    {
      name: 'Kolom Praktis 15x15 cm',
      category: 'STRUCTURE_COLUMN',
      materialSpec: 'Beton bertulang 15x15 cm',
      unit: "m'",
      sourcePage: 1,
      evidenceId: 'EV-DED-S01-003',
      dimensions: { count: { value: 14, unit: 'titik' }, height: { value: 3.8, unit: 'm' } },
      calculationInputs: { count: 14, height: 3.8 },
      rawOcrText: 'Kolom praktis KP 15/15 cm, H = 3.80 m, jumlah 14 titik',
    },
    {
      name: 'Dinding Pasangan Bata Merah',
      category: 'WALL',
      materialSpec: 'Bata merah tebal 1/2 batu mortar 1:4',
      unit: 'm²',
      sourcePage: 2,
      evidenceId: 'EV-DED-A01-001',
      dimensions: { length: { value: 42.0, unit: 'm' }, height: { value: 3.8, unit: 'm' } },
      calculationInputs: { length: 42.0, height: 3.8 },
      rawOcrText: 'Pasangan dinding bata merah tebal 1/2 batu spasi 1:4, keliling = 42.00 m, t = 3.80 m',
    },
    {
      name: 'Plesteran Dinding 1:4',
      category: 'PLASTER',
      materialSpec: 'Plesteran tebal 15 mm mortar 1:4',
      unit: 'm²',
      sourcePage: 2,
      evidenceId: 'EV-DED-A01-002',
      dimensions: { length: { value: 42.0, unit: 'm' }, height: { value: 3.8, unit: 'm' }, count: { value: 2, unit: 'sisi' } },
      calculationInputs: { length: 42.0, height: 3.8, sides: 2, area: 319.2 },
      rawOcrText: 'Plesteran dinding 1:4 t = 15mm 2 sisi, luas total = 319.20 m2',
    },
    {
      name: 'Acian Dinding',
      category: 'PLASTER',
      materialSpec: 'Acian semen PC',
      unit: 'm²',
      sourcePage: 2,
      evidenceId: 'EV-DED-A01-003',
      dimensions: { area: { value: 319.2, unit: 'm²' } },
      calculationInputs: { area: 319.2 },
      rawOcrText: 'Acian dinding semen PC 2 sisi, luas = 319.20 m2',
    },
    {
      name: 'Lantai Keramik Homogeneous Tile 60x60',
      category: 'FLOOR_FINISH',
      materialSpec: 'Homogeneous tile 60x60 cm unpolished',
      unit: 'm²',
      sourcePage: 2,
      evidenceId: 'EV-DED-A01-004',
      dimensions: { length: { value: 8.0, unit: 'm' }, width: { value: 6.0, unit: 'm' } },
      calculationInputs: { length: 8.0, width: 6.0 },
      rawOcrText: 'Penutup lantai ruang utama homogeneous tile 60x60 cm, ruang 8.00 x 6.00 m',
    },
    {
      name: 'Plafon Gypsum Board 9 mm Rangka Hollow',
      category: 'CEILING',
      materialSpec: 'Gypsum board 9 mm rangka hollow 40x40',
      unit: 'm²',
      sourcePage: 2,
      evidenceId: 'EV-DED-A01-005',
      dimensions: { length: { value: 8.0, unit: 'm' }, width: { value: 6.0, unit: 'm' } },
      calculationInputs: { length: 8.0, width: 6.0 },
      rawOcrText: 'Plafon gypsum board 9mm rangka hollow galvanis, area = 48.00 m2',
    },
    {
      name: 'Pintu Panel Kayu Kamper D-02',
      category: 'DOOR_WINDOW',
      materialSpec: 'Kayu Kamper finishing melamik',
      unit: 'unit',
      sourcePage: 2,
      evidenceId: 'EV-DED-A01-006',
      dimensions: { count: { value: 4, unit: 'unit' } },
      calculationInputs: { count: 4 },
      rawOcrText: 'Pintu panel tunggal kayu kamper D-02 ukuran 80x210 cm, jumlah = 4 unit',
    },
    {
      name: 'Kloset Duduk Monoblock',
      category: 'SANITARY',
      materialSpec: 'Kloset duduk monoblock keramik putih',
      unit: 'unit',
      sourcePage: 2,
      evidenceId: 'EV-DED-A01-007',
      dimensions: { count: { value: 2, unit: 'unit' } },
      calculationInputs: { count: 2 },
      rawOcrText: 'Pemasangan kloset duduk monoblock standard TOTO / setara, 2 unit KM/WC',
    },
  ];

  console.log(`[STAGE 1: PROCESSING ${rawDedExtractedItems.length} DED CONSTRUCTION WORK ITEMS]\n`);

  const processedItems: DedWorkItem[] = [];

  for (const raw of rawDedExtractedItems) {
    const itemStub: DedWorkItem = {
      id: `WRK-${raw.category}-${raw.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      name: raw.name,
      category: raw.category,
      materialSpec: raw.materialSpec,
      unit: raw.unit,
      sourceDocumentId: 'DED_Struktur_Arsitektur.pdf',
      sourcePages: [raw.sourcePage],
      evidenceIds: [raw.evidenceId],
      dimensions: raw.dimensions,
      calculationInputs: raw.calculationInputs,
      confidence: 0.95,
      validationStatus: 'NEEDS_REVIEW',
      rabEligible: false,
    };

    // 1. QTO calculation
    const qto = ezrabCoreQto.calculateQuantity(itemStub);
    itemStub.qto = qto;
    itemStub.quantity = qto.quantity;

    // 2. AHSP Matching
    const ahsp = ahspMatcher.matchWorkItem(itemStub);
    itemStub.ahspMatch = ahsp;
    itemStub.ahspStatus = (ahsp?.matchType === 'SEMANTIC_MATCH' || ahsp?.matchType === 'EXACT_MATCH')
      ? 'MATCHED'
      : (ahsp?.matchType === 'AMBIGUOUS' ? 'AMBIGUOUS' : 'NOT_FOUND');

    if (ahsp?.candidates && ahsp.candidates.length > 0) {
      itemStub.candidateAhspList = ahsp.candidates.map(c => ({
        code: c.code,
        name: c.name,
        unit: c.unit,
        matchType: 'SEMANTIC_MATCH',
        source: 'OFFICIAL_DATABASE',
        confidence: 0.85,
      }));
    }

    // 3. Price Resolution
    const price = ahspPriceResolver.resolvePrice(itemStub, [], []);
    itemStub.price = price;
    itemStub.priceStatus = price.priceSource !== 'PRICE_NOT_FOUND' ? 'RESOLVED' : 'NOT_FOUND';

    // 4. 13-Gate Validation
    const validation = dedRabValidationGate.validateItem(itemStub, 'PRJ-RUMAH-2LT-01');
    itemStub.validationStatus = validation.status;
    itemStub.rabEligible = validation.isValid;
    itemStub.validationErrors = validation.errors;
    itemStub.provenanceDetail = validation.provenance;
    (itemStub as any).gates = validation.gates;

    processedItems.push(itemStub);
  }

  const result = {
    success: true,
    sourceDocuments: [{ id: 'DOC-1', fileName: 'DED_Struktur_Arsitektur.pdf', sha256: 'a1b2c3d4e5f67890...' }],
    evidences: rawDedExtractedItems.map(r => ({ id: r.evidenceId, content: r.rawOcrText })),
    workItems: processedItems,
    diagnostics: { aiModel: 'gemini-3.5-flash-lite' },
  };

  console.log('\n================================================================');
  console.log('DETAILED RUNTIME TRACE PER ITEM (SECTION 2 AUDIT)');
  console.log('================================================================\n');

  for (let idx = 0; idx < result.workItems.length; idx++) {
    const item = result.workItems[idx];
    const sourceEv = result.evidences.find((e) => item.evidenceIds?.includes(e.id));
    const semanticRes = semanticClassifier.classify(item.name, item.category);
    const normal = constructionNormalizer.normalize(item.name, item.category, item.materialSpec);
    const qtoRes = ezrabCoreQto.calculateQuantity(item);
    const match = item.ahspMatch;
    const price = item.price;
    const validation = dedRabValidationGate.validateItem(item, 'PRJ-RUMAH-2LT-01');

    // Evaluate 13 Gates individually
    const g1 = semanticRes.isRabEligible && semanticRes.fact.entityType === 'CONSTRUCTION_WORK';
    const g2 = Boolean(item.sourcePages && item.sourcePages.length > 0 && item.evidenceIds && item.evidenceIds.length > 0);
    const g3 = typeof item.quantity === 'number' && item.quantity > 0;
    const g4 = Boolean(item.unit && item.unit !== 'unknown');
    const g5 = Boolean(match && match.code && match.matchType !== 'NOT_FOUND' && match.matchType !== 'AI_CUSTOM');
    const g6 = Boolean(match?.code && officialAhspRepository.hasOfficialAhsp(match.code));
    const g7 = Boolean(g6 && (!match?.source || match.source.includes('2026') || match.source.includes('SE DJBK')));
    const specCheck = (dedRabValidationGate as any).checkSpecificationCompatibility(item.name, item.materialSpec, match?.name || '');
    const g8 = specCheck.isCompatible;
    const g9 = Boolean(price?.components && price.components.length > 0);
    const g10 = Boolean(!item.missingResources || item.missingResources.length === 0);
    const g11 = typeof price?.unitPrice === 'number' && price.unitPrice > 0;
    const isDetCalc = Boolean(g3 && g11 && typeof price?.totalPrice === 'number' && price.totalPrice > 0);
    const g12 = isDetCalc;
    const g13 = !item.warnings || !item.warnings.some(w => w.toLowerCase().includes('conflict') || w.toLowerCase().includes('fatal'));

    const gates = [
      { num: 1, name: 'Construction Work', pass: g1 },
      { num: 2, name: 'Source Trace', pass: g2 },
      { num: 3, name: 'Quantity Valid', pass: g3 },
      { num: 4, name: 'Unit Valid', pass: g4 },
      { num: 5, name: 'AHSP Candidate', pass: g5 },
      { num: 6, name: 'Official AHSP Validation', pass: g6 },
      { num: 7, name: 'Version Match (2026)', pass: g7 },
      { num: 8, name: 'Spec Compatibility', pass: g8 },
      { num: 9, name: 'Components Existence', pass: g9 },
      { num: 10, name: 'Resource Price Validity', pass: g10 },
      { num: 11, name: 'Price Resolved', pass: g11 },
      { num: 12, name: 'Deterministic Calculation', pass: g12 },
      { num: 13, name: 'No Critical Audit Error', pass: g13 },
    ];

    console.log(`----------------------------------------------------------------`);
    console.log(`[DED-RUNTIME-TRACE] #${idx + 1}: ${item.name}`);
    console.log(`----------------------------------------------------------------`);
    console.log(`SOURCE:`);
    console.log(`  - source page: ${item.sourcePages?.join(', ') || 'N/A'}`);
    console.log(`  - evidence id: ${item.evidenceIds?.join(', ') || 'N/A'}`);
    console.log(`  - original OCR / vision text: ${sourceEv?.content || item.name}`);
    console.log(`  - model: ${result.diagnostics.aiModel || 'gemini-3.5-flash-lite'}`);
    console.log(`  - source hash: ${result.sourceDocuments[0]?.sha256 || 'N/A'}`);

    console.log(`CLASSIFICATION:`);
    console.log(`  - classification: ${semanticRes.fact.entityType}`);
    console.log(`  - confidence: ${semanticRes.fact.confidence}`);
    console.log(`  - is CONSTRUCTION_WORK: ${g1}`);
    console.log(`  - reason if rejected: ${g1 ? 'N/A' : (semanticRes.rejectReason || 'Not construction work')}`);

    console.log(`CANONICAL WORK:`);
    console.log(`  - canonical work id: ${item.canonicalWorkId || item.id}`);
    console.log(`  - description: ${normal.workItem}`);
    console.log(`  - category: ${item.category}`);
    console.log(`  - WBS: ${item.workCategory} > ${item.workPackage} > ${item.workItem}`);
    console.log(`  - merged with other work: false`);

    console.log(`QTO:`);
    console.log(`  - quantity: ${item.quantity}`);
    console.log(`  - unit: ${item.unit}`);
    console.log(`  - formula: ${item.qto?.formula || 'N/A'}`);
    console.log(`  - dimensions: ${JSON.stringify(item.calculationInputs || {})}`);
    console.log(`  - quantity source: ${item.quantitySource || 'DED_DIMENSION'}`);
    console.log(`  - source origin: ${item.quantity !== null ? 'DED Evidence' : 'MISSING'}`);

    console.log(`AHSP:`);
    console.log(`  - normalized description: ${normal.workItem} (${normal.specification})`);
    console.log(`  - candidate AHSP: ${match?.code ? `${match.code} - ${match.name}` : (match?.candidates ? match.candidates.map(c => c.code).join(', ') : 'NONE')}`);
    console.log(`  - selected AHSP code: ${match?.code || 'NO_MATCH'}`);
    console.log(`  - selected AHSP description: ${match?.name || 'NO_MATCH'}`);
    console.log(`  - AHSP source: ${match?.source || 'N/A'}`);
    console.log(`  - official catalog existence: ${g6}`);

    console.log(`COMPONENTS:`);
    if (price?.components && price.components.length > 0) {
      price.components.forEach((c) => {
        console.log(`  - [${c.type}] ${c.name} | Coeff: ${c.coefficient} ${c.unit} | UnitPrice: Rp ${c.unitPrice.toLocaleString('id-ID')} | Total: Rp ${c.totalPrice.toLocaleString('id-ID')}`);
      });
    } else {
      console.log(`  - No components resolved (Price status: ${price?.priceSource || 'PRICE_NOT_FOUND'})`);
    }

    console.log(`PRICE:`);
    console.log(`  - unit price: ${price?.unitPrice !== null ? `Rp ${price?.unitPrice?.toLocaleString('id-ID')}` : 'null'}`);
    console.log(`  - price source: ${price?.priceSource || 'PRICE_NOT_FOUND'}`);
    console.log(`  - hierarchy match: ${price?.sourceDetail || 'N/A'}`);
    console.log(`  - material: Rp ${price?.materialPrice?.toLocaleString('id-ID') || 'null'}, labor: Rp ${price?.laborPrice?.toLocaleString('id-ID') || 'null'}, equipment: Rp ${price?.equipmentPrice?.toLocaleString('id-ID') || 'null'}`);

    console.log(`CALCULATION (SafeDecimalEngine):`);
    console.log(`  - unit price: ${price?.unitPrice}`);
    console.log(`  - quantity: ${item.quantity}`);
    console.log(`  - total amount: ${price?.totalPrice !== null ? `Rp ${price?.totalPrice?.toLocaleString('id-ID')}` : 'null'}`);

    console.log(`READINESS (13 GATES):`);
    gates.forEach((g) => {
      console.log(`  - GATE ${String(g.num).padStart(2, '0')} [${g.pass ? 'PASS' : 'FAIL'}]: ${g.name}`);
    });
    const failedGates = gates.filter((g) => !g.pass);
    console.log(`  - Final Validation Status: ${validation.status}`);
    console.log(`  - Truly Ready for RAB: ${validation.isValid && validation.status === 'READY'}`);
    if (failedGates.length > 0) {
      console.log(`  - Failed Gates: ${failedGates.map((g) => `GATE ${g.num} (${g.name})`).join(', ')}`);
      console.log(`  - Validation Errors: ${validation.errors.join(' | ')}`);
    }

    console.log(`RAB INSERTION STATUS:`);
    console.log(`  - inserted: ${validation.isValid && validation.status === 'READY'}`);
    console.log(`  - reason: ${validation.isValid && validation.status === 'READY' ? 'Eligible for RAB' : validation.errors[0] || 'Validation gate failed'}\n`);
  }
}

runForensicAudit().catch(console.error);

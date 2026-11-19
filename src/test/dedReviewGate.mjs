/**
 * dedReviewGate.mjs — Asersi logika murni chip bukti kuantitas +
 * gerbang review sebelum finalisasi (mockup DED v2.3, ACC owner
 * 2026-11-19 04:14). Skrip asersi tsx polos (bukan suite Vitest).
 * Run: npx --yes tsx src/test/dedReviewGate.mjs
 *
 * Kasus: pemetaan source → chip (standar + Full AI); Klaim & Input
 * user TIDAK masuk gerbang; estimasi/asumsi/harga-AI/AHSP masuk;
 * finalisasi diblokir bila ada yang belum dicentang; item terblokir
 * tidak bisa difinalisasi.
 */
import {
  quantityEvidenceChipFor,
  quantityEvidenceChipForFullAiItem,
  reviewGateItemsForDed,
  reviewGateItemsForFullAi,
  reviewGateSummary,
  reviewedCount,
  isReviewGateComplete,
  canFinalizeWithGate,
  countSavableDed,
  countSavableFullAi,
  needsAhspConfirmation,
} from '../ai-tools/ded-ai-estimate/dedReviewGate.ts';

let pass = 0;
let fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; console.log(`✓ ${name}`); }
  else { fail++; console.error(`✗ ${name}`); }
};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Item standar minimal yang savable (stage CALCULATED + harga + subtotal). */
const dedItem = (over = {}) => ({
  id: 'i1',
  name: 'Item uji',
  category: 'Struktur',
  units: 'm3',
  quantity: 1,
  quantitySource: 'DED_EXPLICIT',
  unitPrice: 100000,
  priceSource: 'AHSP_2026',
  subtotal: 100000,
  sourcePages: [2],
  provenance: [],
  stage: 'CALCULATED',
  ...over,
});

const ahspNeedsReview = {
  status: 'NEEDS_REVIEW',
  matchedCode: undefined,
  unitPrice: null,
  sourceDocument: 'SE DJBK No. 47/SE/Dk/2026',
  period: '2026',
  candidates: [
    { code: '3.2.1.1', name: 'Kusen pintu kayu kelas I', unit: 'bh', score: 96,
      unitExact: true, unitCompatible: true, canonicalPrice: 925000,
      priceStatus: 'FULL', missingComponents: [] },
  ],
  reason: 'Dua kandidat mirip — pilih satu.',
  missingComponents: [],
  resolutionPath: [],
};

/** Item Full AI minimal yang savable (status READY + subtotal > 0). */
const fullAiItem = (over = {}) => ({
  id: 'f1',
  no: 1,
  name: 'Item Full AI',
  category: 'Struktur',
  quantity: {
    value: 1, unit: 'm3', provenance: 'EXPLICIT', confidence: 'HIGH',
  },
  price: { unitPrice: 100000, unit: 'm3', source: 'AHSP_2026' },
  subtotal: 100000,
  subtotalVerified: true,
  status: 'READY',
  exclusionReason: null,
  ...over,
});

console.log('== 1. Pemetaan source → chip (standar) ==');
check('DED_EXPLICIT → Klaim: dimensi DED (kuning)',
  quantityEvidenceChipFor('DED_EXPLICIT').label === 'Klaim: dimensi DED'
  && quantityEvidenceChipFor('DED_EXPLICIT').kind === 'claim'
  && quantityEvidenceChipFor('DED_EXPLICIT').bg === '#FEF3C7');
check('DED_GEOMETRIC → Klaim: dimensi DED (kuning)',
  quantityEvidenceChipFor('DED_GEOMETRIC').label === 'Klaim: dimensi DED'
  && quantityEvidenceChipFor('DED_GEOMETRIC').kind === 'claim');
check('DERIVED → Hitungan deterministik (biru)',
  quantityEvidenceChipFor('DERIVED').label === 'Hitungan deterministik'
  && quantityEvidenceChipFor('DERIVED').bg === '#DBEAFE');
check('AI_INFERENCE → Perkiraan AI (ungu)',
  quantityEvidenceChipFor('AI_INFERENCE').label === 'Perkiraan AI'
  && quantityEvidenceChipFor('AI_INFERENCE').bg === '#EDE9FE');
check('ASSUMPTION → Asumsi (oranye)',
  quantityEvidenceChipFor('ASSUMPTION').label === 'Asumsi'
  && quantityEvidenceChipFor('ASSUMPTION').bg === '#FFEDD5');
check('USER_INPUT → Input user (hijau)',
  quantityEvidenceChipFor('USER_INPUT').label === 'Input user'
  && quantityEvidenceChipFor('USER_INPUT').bg === '#DCFCE7');
check('UNRESOLVED → Belum jelas (abu-abu)',
  quantityEvidenceChipFor('UNRESOLVED').label === 'Belum jelas'
  && quantityEvidenceChipFor('UNRESOLVED').bg === '#F1F5F9');
check('sumber tak dikenal → Belum jelas (fail-closed)',
  quantityEvidenceChipFor('SESUATU_YANG_TIDAK_ADA').label === 'Belum jelas'
  && quantityEvidenceChipFor(null).label === 'Belum jelas'
  && quantityEvidenceChipFor(undefined).label === 'Belum jelas');
check('TIDAK ADA chip yang mengklaim "terverifikasi" sebagai kuantitas',
  ['DED_EXPLICIT', 'DED_GEOMETRIC', 'DERIVED', 'AI_INFERENCE', 'ASSUMPTION', 'USER_INPUT', 'UNRESOLVED']
    .every((s) => !quantityEvidenceChipFor(s).label.toLowerCase().includes('terverifikasi')));

console.log('== 2. Pemetaan provenance Full AI → chip (via FULL_AI_QUANTITY_SOURCE) ==');
check('EXPLICIT → Klaim: dari DED (kuning)',
  quantityEvidenceChipForFullAiItem(fullAiItem()).label === 'Klaim: dari DED'
  && quantityEvidenceChipForFullAiItem(fullAiItem()).kind === 'claim');
check('DERIVED → Hitungan deterministik',
  quantityEvidenceChipForFullAiItem(fullAiItem({
    quantity: { value: 1, unit: 'm3', provenance: 'DERIVED', confidence: 'HIGH' },
  })).label === 'Hitungan deterministik');
check('ASSUMPTION → Asumsi',
  quantityEvidenceChipForFullAiItem(fullAiItem({
    quantity: { value: 1, unit: 'm3', provenance: 'ASSUMPTION', confidence: 'LOW' },
  })).label === 'Asumsi');
check('NEEDS_CONFIRMATION → Perkiraan AI (dipetakan ke AI_INFERENCE)',
  quantityEvidenceChipForFullAiItem(fullAiItem({
    quantity: { value: 1, unit: 'm3', provenance: 'NEEDS_CONFIRMATION', confidence: 'LOW' },
  })).label === 'Perkiraan AI');
check('USER_INPUT → Input user',
  quantityEvidenceChipForFullAiItem(fullAiItem({
    quantity: { value: 1, unit: 'm3', provenance: 'USER_INPUT', confidence: 'HIGH' },
  })).label === 'Input user');
check('UNRESOLVED → Belum jelas',
  quantityEvidenceChipForFullAiItem(fullAiItem({
    quantity: { value: null, unit: 'm3', provenance: 'UNRESOLVED', confidence: 'LOW' },
  })).label === 'Belum jelas');

console.log('== 3. Gerbang: Klaim & Input user TIDAK masuk ==');
check('Klaim + harga kanonis → tidak masuk gerbang',
  reviewGateItemsForDed([dedItem()]).length === 0);
check('Klaim geometrik + harga kanonis → tidak masuk gerbang',
  reviewGateItemsForDed([dedItem({ quantitySource: 'DED_GEOMETRIC' })]).length === 0);
check('Hitungan deterministik + harga kanonis → tidak masuk gerbang',
  reviewGateItemsForDed([dedItem({ quantitySource: 'DERIVED' })]).length === 0);
check('Input user + harga manual → tidak masuk gerbang',
  reviewGateItemsForDed([dedItem({
    quantitySource: 'USER_INPUT', priceSource: 'USER_INPUT',
  })]).length === 0);
check('Full AI: Klaim dari DED + harga kanonis → tidak masuk gerbang',
  reviewGateItemsForFullAi([fullAiItem()]).length === 0);
check('Full AI: Input user → tidak masuk gerbang',
  reviewGateItemsForFullAi([fullAiItem({
    quantity: { value: 1, unit: 'm3', provenance: 'USER_INPUT', confidence: 'HIGH' },
    price: { unitPrice: 100000, unit: 'm3', source: 'USER_INPUT' },
  })]).length === 0);

console.log('== 4. Gerbang: estimasi / asumsi / harga-AI / AHSP MASUK ==');
{
  const aiQty = reviewGateItemsForDed([dedItem({ id: 'a', quantitySource: 'AI_INFERENCE' })]);
  check('AI_INFERENCE masuk (alasan kuantitas, tag Perkiraan AI)',
    aiQty.length === 1 && aiQty[0].reasons.includes('QUANTITY_ESTIMATE')
    && aiQty[0].tags.some((t) => t.label === 'Kuantitas: Perkiraan AI'));
  const asumsi = reviewGateItemsForDed([dedItem({ id: 'b', quantitySource: 'ASSUMPTION' })]);
  check('ASSUMPTION masuk (tag Kuantitas: Asumsi)',
    asumsi.length === 1 && asumsi[0].tags.some((t) => t.label === 'Kuantitas: Asumsi'));
  const aiPrice = reviewGateItemsForDed([dedItem({ id: 'c', priceSource: 'AI_ESTIMATE' })]);
  check('harga AI_ESTIMATE masuk (tag Harga: Estimasi AI)',
    aiPrice.length === 1 && aiPrice[0].reasons.includes('PRICE_ESTIMATE')
    && aiPrice[0].tags.some((t) => t.label === 'Harga: Estimasi AI'));
  const ahsp = reviewGateItemsForDed([dedItem({
    id: 'd', priceSource: 'AI_ESTIMATE', ahspMatch: ahspNeedsReview,
  })]);
  check('AHSP NEEDS_REVIEW berkandidat masuk (tag Padanan AHSP)',
    ahsp.length === 1 && ahsp[0].reasons.includes('AHSP_CONFIRM')
    && ahsp[0].tags.some((t) => t.label === 'Padanan AHSP belum dikonfirmasi'));
  check('item dengan 2 alasan = SATU entri gerbang (satu centang)',
    ahsp.length === 1 && ahsp[0].reasons.length === 2);
  check('AHSP RESOLVED → tidak masuk lewat AHSP',
    reviewGateItemsForDed([dedItem({
      ahspMatch: { ...ahspNeedsReview, status: 'RESOLVED', candidates: [] },
    })]).length === 0);
  check('AHSP NEEDS_REVIEW TANPA kandidat → tidak masuk lewat AHSP',
    needsAhspConfirmation({ ...ahspNeedsReview, candidates: [] }) === false
    && reviewGateItemsForDed([dedItem({
      ahspMatch: { ...ahspNeedsReview, candidates: [] },
    })]).length === 0);
  check('deskripsi gerbang memakai quantityNote apa adanya (tanpa karang)',
    reviewGateItemsForDed([dedItem({
      id: 'e', quantitySource: 'ASSUMPTION', quantityNote: 'Luas dinding diasumsikan dari denah.',
    })])[0].description.includes('Luas dinding diasumsikan dari denah.'));
}

console.log('== 5. Gerbang Full AI: VERIFIED_SOURCE warisan + AHSP ==');
{
  const legacy = reviewGateItemsForFullAi([fullAiItem({
    id: 'g1',
    price: { unitPrice: 100000, unit: 'm3', source: 'VERIFIED_SOURCE' },
  })]);
  check('VERIFIED_SOURCE warisan digerbang sebagai estimasi AI (plafon jujur)',
    legacy.length === 1 && legacy[0].reasons.includes('PRICE_ESTIMATE'));
  const ahspFull = reviewGateItemsForFullAi([fullAiItem({
    id: 'g2',
    price: { unitPrice: 100000, unit: 'm3', source: 'AI_ESTIMATE', ahspMatch: ahspNeedsReview },
  })]);
  check('Full AI: AHSP NEEDS_REVIEW berkandidat masuk gerbang',
    ahspFull.length === 1 && ahspFull[0].reasons.includes('AHSP_CONFIRM'));
  const asumsiFull = reviewGateItemsForFullAi([fullAiItem({
    id: 'g3',
    quantity: { value: 1, unit: 'm3', provenance: 'ASSUMPTION', confidence: 'LOW' },
  })]);
  check('Full AI: ASSUMPTION masuk gerbang',
    asumsiFull.length === 1 && asumsiFull[0].reasons.includes('QUANTITY_ESTIMATE'));
}

console.log('== 6. Item terblokir TIDAK masuk gerbang & TIDAK bisa finalisasi ==');
{
  const blocked = [
    dedItem({ id: 'x1', quantity: null, subtotal: null, stage: 'QUANTITY' }),
    dedItem({ id: 'x2', unitPrice: null, subtotal: null, stage: 'PRICING' }),
    dedItem({ id: 'x3', quantitySource: 'AI_INFERENCE', quantity: null, subtotal: null, stage: 'QUANTITY' }),
  ];
  check('item tanpa kuantitas/harga tidak masuk daftar tinjau',
    reviewGateItemsForDed(blocked).length === 0);
  check('batch hanya-terblokir: savableCount 0',
    countSavableDed(blocked) === 0);
  check('batch hanya-terblokir: finalisasi DITOLAK walau gerbang kosong',
    canFinalizeWithGate({
      gateItems: reviewGateItemsForDed(blocked),
      checkedIds: new Set(),
      savableCount: countSavableDed(blocked),
    }) === false);
  const blockedFull = [
    fullAiItem({ id: 'y1', status: 'UNRESOLVED', quantity: { value: null, unit: 'm3', provenance: 'UNRESOLVED', confidence: 'LOW' }, subtotal: null }),
    fullAiItem({ id: 'y2', status: 'NEEDS_CONFIRMATION', subtotal: 100000 }),
  ];
  check('Full AI terblokir (UNRESOLVED / NEEDS_CONFIRMATION) tidak masuk gerbang',
    reviewGateItemsForFullAi(blockedFull).length === 0
    && countSavableFullAi(blockedFull) === 0);
  check('Full AI hanya-terblokir: finalisasi DITOLAK',
    canFinalizeWithGate({
      gateItems: reviewGateItemsForFullAi(blockedFull),
      checkedIds: new Set(),
      savableCount: countSavableFullAi(blockedFull),
    }) === false);
}

console.log('== 7. Finalisasi: diblokir bila ada yang belum dicentang ==');
{
  const items = [
    dedItem({ id: 'm1', quantitySource: 'AI_INFERENCE' }),
    dedItem({ id: 'm2', priceSource: 'AI_ESTIMATE' }),
    dedItem({ id: 'm3' }),
  ];
  const gate = reviewGateItemsForDed(items);
  check('ringkasan: 2 item tinjau (1 kuantitas, 1 harga)',
    eq(reviewGateSummary(gate), { total: 2, quantityCount: 1, priceCount: 1, ahspCount: 0 }));
  check('belum dicentang sama sekali → gerbang tidak lengkap',
    isReviewGateComplete(gate, new Set()) === false);
  check('belum dicentang sama sekali → finalisasi DITOLAK',
    canFinalizeWithGate({ gateItems: gate, checkedIds: new Set(), savableCount: 3 }) === false);
  check('satu dicentang → masih DITOLAK (wajib satu per satu, tanpa tandai-semua)',
    isReviewGateComplete(gate, new Set(['m1'])) === false
    && canFinalizeWithGate({ gateItems: gate, checkedIds: new Set(['m1']), savableCount: 3 }) === false
    && reviewedCount(gate, new Set(['m1'])) === 1);
  check('semua dicentang → gerbang lengkap + finalisasi DIIZINKAN',
    isReviewGateComplete(gate, new Set(['m1', 'm2'])) === true
    && canFinalizeWithGate({ gateItems: gate, checkedIds: new Set(['m1', 'm2']), savableCount: 3 }) === true);
  check('centang basi (id tak ada di gerbang) tidak membuka gerbang',
    isReviewGateComplete(gate, new Set(['id-yang-tidak-ada'])) === false);
  const emptyGate = reviewGateItemsForDed([dedItem({ id: 'n1' })]);
  check('gerbang kosong + ada savable → finalisasi DIIZINKAN',
    canFinalizeWithGate({ gateItems: emptyGate, checkedIds: new Set(), savableCount: 1 }) === true);
}

console.log(`\nHASIL dedReviewGate: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);

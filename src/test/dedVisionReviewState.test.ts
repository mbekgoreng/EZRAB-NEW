// Suite: DED vision — visual review state + viewer smoke check (increment I7, spec §10).
// src/ai-tools/ded-vision/reviewState.ts — pure review logic (no React/DOM).
// src/ai-tools/ded-ai-estimate/DedVisionReviewViewer.tsx — smoke import only
// (no DOM rendering in tsx; the component's visual behaviour is verified by
// I7b in the live view + a browser check).
// Ground truth dihitung tangan (bukan dari output modul):
//   dinding 3500×3000 mm − pintu 900×2100 mm = 10.5 − 1.89 = 8.61 m² (golden I4)
//   koreksi tinggi → 3200 mm: 3.5 × 3.2 − 1.89 = 11.2 − 1.89 = 9.31 m²
//   koreksi tinggi → 500 mm: 3.5 × 0.5 = 1.75 < 1.89 → tak konsisten → null
//   bbox {x:100,y:200,w:300,h:40} pada gambar 1000×2000 px → 10% / 10% / 30% / 2%
// Jalankan dari root repo: npx --yes tsx src/test/dedVisionReviewState.test.ts
import {
  approveAssumption,
  bboxToPercent,
  confidenceToColor,
  confirmItem,
  correctItem,
  createReviewState,
  itemsOnPage,
  jumpTarget,
  rejectAssumption,
  rejectItem,
  reviewCounts,
  reviewItemById,
  reviewItemFromDedAiItem,
  reviewItemFromDimension,
  reviewItemFromGeometry,
  reviewItemFromOpening,
} from '../ai-tools/ded-vision/reviewState';
import type { ReviewItem } from '../ai-tools/ded-vision/reviewState';
import { statusFromConfidence } from '../ai-tools/ded-vision/types';
import type {
  DimensionRecord,
  EvidenceRecord,
  OpeningRecord,
} from '../ai-tools/ded-vision/types';
import type { DedAiItem } from '../ai-tools/ded-ai-estimate/types';
import { qtoWallNetArea } from '../ai-tools/ded-vision/geometryQto';
import {
  DedVisionReviewViewer,
  DEDVR_ZOOM_MAX,
  DEDVR_ZOOM_MIN,
  DEDVR_ZOOM_STEP,
} from '../ai-tools/ded-ai-estimate/DedVisionReviewViewer';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}`); }
}

function eq4(actual: number | null, expected: number): boolean {
  return actual !== null && Math.abs(actual - expected) < 1e-9;
}

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const dimRecord: DimensionRecord = {
  id: 'd1',
  originalText: '3.500',
  normalizedValue: 3.5,
  unit: 'm',
  kind: 'LINEAR',
  page: 3,
  region: { x: 100, y: 200, width: 300, height: 40 },
  confidence: 0.92,
  status: 'HIGH_CONFIDENCE',
};

const openingEvidence: EvidenceRecord = {
  id: 'EV-001',
  sourceDocumentId: 'doc-1',
  sourceFileName: 'rumah.pdf',
  pageNumber: 3,
  type: 'SCHEDULE_ROW',
  content: 'D1 900×2100',
  confidence: 0.95,
  boundingBox: { x: 400, y: 600, width: 90, height: 210 },
};

const openingRecord: OpeningRecord = {
  elementType: 'door',
  mark: 'D1',
  widthMm: 900,
  heightMm: 2100,
  quantity: 2,
  material: 'Aluminium',
  frame: 'Aluminium',
  glazing: null,
  schedulePage: 25,
  sourcePages: [3],
  evidence: [openingEvidence],
  confidence: 0.95,
  status: 'HIGH_CONFIDENCE',
};

const openingNoDims: OpeningRecord = {
  ...openingRecord,
  mark: 'J1',
  elementType: 'window',
  widthMm: null,
  heightMm: null,
  quantity: 4,
  evidence: [],
};

function makeLiveItem(overrides: Partial<DedAiItem>): DedAiItem {
  return {
    id: 'live-1',
    name: 'Pondasi batu kali',
    category: 'Pondasi',
    units: 'm3',
    quantity: 9.6,
    quantitySource: 'DED_EXPLICIT',
    unitPrice: 100000,
    priceSource: 'AHSP_2026',
    subtotal: 960000,
    sourcePages: [3, 5],
    provenance: ['DED'],
    stage: 'CALCULATED',
    ...overrides,
  };
}

/** Wall golden (I4): 3500×3000 − pintu 900×2100 = 8.61 m², page 3. */
function makeWallItem(assumptions?: string[]): ReviewItem {
  const q = qtoWallNetArea(
    3500,
    3000,
    [{ widthMm: 900, heightMm: 2100 }],
    { sourcePages: [3], assumptions },
  );
  return reviewItemFromGeometry(q, { label: 'Dinding bata — netto' });
}

console.log('dedVisionReviewState — review state I7 + viewer smoke');

/* ------------------------------------------------------------------ */
/* confidenceToColor: thresholds incl. boundaries                      */
/* ------------------------------------------------------------------ */
check('confidence 1 → green', confidenceToColor(1) === 'green');
check('confidence 0.85 → green (batas atas)', confidenceToColor(0.85) === 'green');
check('confidence 0.849 → yellow (tepat di bawah batas)', confidenceToColor(0.849) === 'yellow');
check('confidence 0.6 → yellow (batas bawah)', confidenceToColor(0.6) === 'yellow');
check('confidence 0.599 → red (tepat di bawah batas)', confidenceToColor(0.599) === 'red');
check('confidence 0 → red', confidenceToColor(0) === 'red');
check('confidence NaN → red (fail-closed)', confidenceToColor(NaN) === 'red');
check('confidence Infinity → red (fail-closed)', confidenceToColor(Infinity) === 'red');

/* ------------------------------------------------------------------ */
/* statusFromConfidence: VERIFIED tidak pernah dari confidence         */
/* ------------------------------------------------------------------ */
check('statusFromConfidence(1) = HIGH_CONFIDENCE, bukan VERIFIED', statusFromConfidence(1) === 'HIGH_CONFIDENCE');
check('statusFromConfidence(0.85) = HIGH_CONFIDENCE', statusFromConfidence(0.85) === 'HIGH_CONFIDENCE');
check('statusFromConfidence(0.6) = NEEDS_REVIEW', statusFromConfidence(0.6) === 'NEEDS_REVIEW');
check('statusFromConfidence(NaN) = UNRESOLVED', statusFromConfidence(NaN) === 'UNRESOLVED');
check(
  'tidak ada confidence yang menghasilkan VERIFIED',
  [0, 0.5, 0.6, 0.85, 0.99, 1].every((c) => statusFromConfidence(c) !== 'VERIFIED'),
);

/* ------------------------------------------------------------------ */
/* Adapters                                                            */
/* ------------------------------------------------------------------ */
const dimItem = reviewItemFromDimension(dimRecord);
check('dimensi: originalText "3.500" dipertahankan verbatim', dimItem.originalText === '3.500');
check('dimensi: bbox = region rekaman', dimItem.bbox !== null && dimItem.bbox.x === 100 && dimItem.bbox.width === 300);
check('dimensi: page 3, interpretasi 3.5 m', dimItem.page === 3 && dimItem.interpretation.value === 3.5 && dimItem.interpretation.unit === 'm');
check('dimensi: kind dimension, status bukan VERIFIED', dimItem.kind === 'dimension' && dimItem.status !== 'VERIFIED');

const openingItem = reviewItemFromOpening(openingRecord);
check('bukaan: label memuat mark D1', openingItem.label.includes('D1'));
check('bukaan: interpretasi jumlah 2 unit', openingItem.interpretation.value === 2 && openingItem.interpretation.unit === 'unit');
check('bukaan: detail memuat ukuran bukti 900 × 2100', openingItem.interpretation.detail.includes('900') && openingItem.interpretation.detail.includes('2100'));
check('bukaan: bbox dari evidence pertama', openingItem.bbox !== null && openingItem.bbox.x === 400 && openingItem.bbox.height === 210);
check('bukaan: page = sourcePages pertama (3)', openingItem.page === 3);

const openingNoDimsItem = reviewItemFromOpening(openingNoDims);
check('bukaan tanpa dimensi: detail TIDAK mengarang ukuran (tanpa "×")', !openingNoDimsItem.interpretation.detail.includes('×'));
check('bukaan tanpa dimensi: inputs tanpa lebar_mm/tinggi_mm', !('lebar_mm' in openingNoDimsItem.inputs) && !('tinggi_mm' in openingNoDimsItem.inputs));

const wallItem = makeWallItem();
check('geometri: dinding netto golden = 8.61 m²', eq4(wallItem.interpretation.value, 8.61) && wallItem.interpretation.unit === 'm2');
check('geometri: formula dipertahankan', wallItem.formula === '3.500 × 3.000 − 0.900 × 2.100');
check('geometri: recomputeKind terinferensi wall-net-area', wallItem.recomputeKind === 'wall-net-area');
check('geometri: status HIGH_CONFIDENCE (bukan VERIFIED)', wallItem.status === 'HIGH_CONFIDENCE');

const liveNull = reviewItemFromDedAiItem(makeLiveItem({ quantity: null, quantitySource: 'UNRESOLVED' }));
check('live null: nilai null (bukan 0) + UNRESOLVED', liveNull.interpretation.value === null && liveNull.status === 'UNRESOLVED');
check('live null: bbox null (tanpa posisi palsu)', liveNull.bbox === null);
const liveAssumption = reviewItemFromDedAiItem(
  makeLiveItem({ quantitySource: 'ASSUMPTION', quantityNote: 'Tinggi dinding diasumsikan 3.2 m' }),
);
check('live asumsi: NEEDS_REVIEW + 1 asumsi pending', liveAssumption.status === 'NEEDS_REVIEW' && liveAssumption.assumptions.length === 1 && liveAssumption.assumptions[0].decision === 'pending');
const liveUser = reviewItemFromDedAiItem(makeLiveItem({ quantitySource: 'USER_INPUT' }));
check('live USER_INPUT: HIGH_CONFIDENCE — adapter tidak pernah VERIFIED', liveUser.status === 'HIGH_CONFIDENCE');

/* ------------------------------------------------------------------ */
/* confirmItem + guard VERIFIED                                        */
/* ------------------------------------------------------------------ */
const stateWall = createReviewState([makeWallItem()]);
const confirmed = confirmItem(stateWall, stateWall.items[0].id);
check('confirm: HIGH_CONFIDENCE + nilai → VERIFIED, ok', confirmed.ok && reviewItemById(confirmed.state, stateWall.items[0].id)?.status === 'VERIFIED');
check('confirm: confidence menjadi 1', reviewItemById(confirmed.state, stateWall.items[0].id)?.confidence === 1);
check('confirm: state asli TIDAK berubah (immutable)', stateWall.items[0].status === 'HIGH_CONFIDENCE');
check('confirm: state baru adalah objek baru', confirmed.state !== stateWall);
const confirmedAgain = confirmItem(confirmed.state, stateWall.items[0].id);
check('confirm: idempotent pada item VERIFIED', confirmedAgain.ok && reviewItemById(confirmedAgain.state, stateWall.items[0].id)?.status === 'VERIFIED');

const stateNull = createReviewState([liveNull]);
const confirmNull = confirmItem(stateNull, liveNull.id);
check('confirm: item UNRESOLVED tanpa nilai DITOLAK (tetap UNRESOLVED)', !confirmNull.ok && reviewItemById(confirmNull.state, liveNull.id)?.status === 'UNRESOLVED' && confirmNull.state === stateNull);

const stateMissing = createReviewState([makeWallItem()]);
const confirmMissing = confirmItem(stateMissing, 'tidak-ada');
check('confirm: id tak dikenal ditolak', !confirmMissing.ok && confirmMissing.state === stateMissing);

/* ------------------------------------------------------------------ */
/* correctItem: recompute input deterministik (golden dinding)         */
/* ------------------------------------------------------------------ */
const wallFixture = makeWallItem();
const wallId = wallFixture.id;
const stateCorrect = createReviewState([wallFixture]);
const corrected = correctItem(stateCorrect, wallId, { type: 'input', inputName: 'tinggi_dinding_mm', value: 3200 });
const correctedItem = reviewItemById(corrected.state, wallId);
check('koreksi input: tinggi 3200 → 9.31 m² tepat', corrected.ok && eq4(correctedItem?.interpretation.value ?? null, 9.31));
check('koreksi input: formula diperbarui deterministik', correctedItem?.formula === '3.500 × 3.200 − 0.900 × 2.100');
check('koreksi input tanpa confirm → NEEDS_REVIEW (bukan VERIFIED)', correctedItem?.status === 'NEEDS_REVIEW');
check('koreksi input: correctedFrom mencatat nilai lama 8.61', correctedItem?.correctedFrom?.previousValue === 8.61);

const stateCorrectConfirm = createReviewState([wallFixture]);
const correctedConfirmed = correctItem(
  stateCorrectConfirm,
  wallId,
  { type: 'input', inputName: 'tinggi_dinding_mm', value: 3200 },
  { confirm: true },
);
check('koreksi input + confirm → VERIFIED', correctedConfirmed.ok && reviewItemById(correctedConfirmed.state, wallId)?.status === 'VERIFIED');

const stateBadNaN = createReviewState([wallFixture]);
const badNaN = correctItem(stateBadNaN, wallId, { type: 'input', inputName: 'tinggi_dinding_mm', value: NaN });
check('koreksi input NaN ditolak, nilai tetap 8.61', !badNaN.ok && reviewItemById(badNaN.state, wallId)?.interpretation.value === 8.61);
const stateBadNeg = createReviewState([wallFixture]);
const badNeg = correctItem(stateBadNeg, wallId, { type: 'input', inputName: 'tinggi_dinding_mm', value: -100 });
check('koreksi input negatif ditolak, nilai tetap 8.61', !badNeg.ok && reviewItemById(badNeg.state, wallId)?.interpretation.value === 8.61);

const stateNoRecompute = createReviewState([dimItem]);
const noRecompute = correctItem(stateNoRecompute, dimItem.id, { type: 'input', inputName: 'panjang_mm', value: 3600 });
check('koreksi input tanpa recomputeKind ditolak jujur', !noRecompute.ok && noRecompute.state === stateNoRecompute);

const stateExceed = createReviewState([wallFixture]);
const exceed = correctItem(stateExceed, wallId, { type: 'input', inputName: 'tinggi_dinding_mm', value: 500 });
const exceedItem = reviewItemById(exceed.state, wallId);
check('koreksi bikin bukaan > dinding: nilai null + UNRESOLVED (bukan negatif)', exceed.ok && exceedItem?.interpretation.value === null && exceedItem?.status === 'UNRESOLVED');

const stateCount = createReviewState([openingItem]);
const countFrac = correctItem(stateCount, openingItem.id, { type: 'input', inputName: 'jumlah', value: 2.5 });
check('koreksi jumlah pecahan 2.5 ditolak', !countFrac.ok && reviewItemById(countFrac.state, openingItem.id)?.interpretation.value === 2);
const countOk = correctItem(stateCount, openingItem.id, { type: 'input', inputName: 'jumlah', value: 3 });
check('koreksi jumlah 2 → 3 berhasil (recompute count)', countOk.ok && reviewItemById(countOk.state, openingItem.id)?.interpretation.value === 3);

/* ------------------------------------------------------------------ */
/* correctItem: koreksi nilai langsung                                 */
/* ------------------------------------------------------------------ */
const stateValue = createReviewState([wallFixture]);
const valueCorrected = correctItem(stateValue, wallId, { type: 'value', value: 9 });
const valueItem = reviewItemById(valueCorrected.state, wallId);
check('koreksi nilai langsung 8.61 → 9.0', valueCorrected.ok && valueItem?.interpretation.value === 9);
check('koreksi nilai: status NEEDS_REVIEW tanpa confirm', valueItem?.status === 'NEEDS_REVIEW');
check('koreksi nilai: catatan rumus-asal ditambahkan', (valueItem?.notes ?? []).some((n) => n.includes('rumus asal')));
const valueConfirmed = correctItem(createReviewState([wallFixture]), wallId, { type: 'value', value: 9 }, { confirm: true });
check('koreksi nilai + confirm → VERIFIED', valueConfirmed.ok && reviewItemById(valueConfirmed.state, wallId)?.status === 'VERIFIED');
const valueNeg = correctItem(createReviewState([wallFixture]), wallId, { type: 'value', value: -1 });
check('koreksi nilai negatif ditolak', !valueNeg.ok && reviewItemById(valueNeg.state, wallId)?.interpretation.value === 8.61);
const valueNaN = correctItem(createReviewState([wallFixture]), wallId, { type: 'value', value: NaN });
check('koreksi nilai NaN ditolak', !valueNaN.ok);
const valueFracCount = correctItem(createReviewState([openingItem]), openingItem.id, { type: 'value', value: 2.5 });
check('koreksi nilai pecahan pada item unit ditolak', !valueFracCount.ok);

const elevItem = reviewItemFromDimension({ ...dimRecord, id: 'd-elev', kind: 'ELEVATION', originalText: '+3.500' });
const elevCorrected = correctItem(createReviewState([elevItem]), elevItem.id, { type: 'value', value: -0.5 });
check('koreksi elevasi negatif (-0.5) DIIZINKAN', elevCorrected.ok && reviewItemById(elevCorrected.state, elevItem.id)?.interpretation.value === -0.5);
const dimCorrected = correctItem(createReviewState([dimItem]), dimItem.id, { type: 'value', value: 3.6 });
check('koreksi dimensi: originalText "3.500" tetap (tidak ditulis ulang)', dimCorrected.ok && reviewItemById(dimCorrected.state, dimItem.id)?.originalText === '3.500');

/* ------------------------------------------------------------------ */
/* rejectItem                                                          */
/* ------------------------------------------------------------------ */
const stateReject = createReviewState([dimItem]);
const rejected = rejectItem(stateReject, dimItem.id, 'Dimensi ini sebenarnya nomor detail, bukan panjang.');
const rejectedItem = reviewItemById(rejected.state, dimItem.id);
check('reject: → NOT_DETECTED, nilai null, alasan tercatat', rejected.ok && rejectedItem?.status === 'NOT_DETECTED' && rejectedItem?.interpretation.value === null && rejectedItem?.rejectionReason?.includes('nomor detail'));
check('reject: originalText dipertahankan untuk audit', rejectedItem?.originalText === '3.500');
const rejectNoReason = rejectItem(createReviewState([dimItem]), dimItem.id, '   ');
check('reject tanpa alasan ditolak', !rejectNoReason.ok && reviewItemById(rejectNoReason.state, dimItem.id)?.status === 'HIGH_CONFIDENCE');
const confirmRejected = confirmItem(rejected.state, dimItem.id);
check('confirm pada item NOT_DETECTED ditolak', !confirmRejected.ok && reviewItemById(confirmRejected.state, dimItem.id)?.status === 'NOT_DETECTED');
const correctRejected = correctItem(rejected.state, dimItem.id, { type: 'value', value: 1 });
check('koreksi pada item NOT_DETECTED ditolak', !correctRejected.ok);

/* ------------------------------------------------------------------ */
/* Asumsi: approve / reject                                            */
/* ------------------------------------------------------------------ */
const wallWithAssumption = makeWallItem(['Tinggi dinding diasumsikan dari potongan A-A']);
const assumptionId = wallWithAssumption.assumptions[0].id;
const stateApprove = createReviewState([wallWithAssumption]);
const approved = approveAssumption(stateApprove, wallWithAssumption.id, assumptionId, 'Cek potongan: benar 3.0 m');
const approvedItem = reviewItemById(approved.state, wallWithAssumption.id);
check('approve asumsi: decision approved + catatan tersimpan', approved.ok && approvedItem?.assumptions[0].decision === 'approved' && approvedItem?.assumptions[0].note === 'Cek potongan: benar 3.0 m');
check('approve asumsi: status item TIDAK berubah (bukan konfirmasi item)', approvedItem?.status === 'HIGH_CONFIDENCE');
const approveMissing = approveAssumption(createReviewState([wallWithAssumption]), wallWithAssumption.id, 'tidak-ada');
check('approve asumsi tak dikenal ditolak', !approveMissing.ok);

const stateRejectAssumption = createReviewState([wallWithAssumption]);
const rejectedAssumption = rejectAssumption(stateRejectAssumption, wallWithAssumption.id, assumptionId, 'Potongan menunjukkan 3.2 m');
const rejectedAssumptionItem = reviewItemById(rejectedAssumption.state, wallWithAssumption.id);
check('reject asumsi: decision rejected', rejectedAssumption.ok && rejectedAssumptionItem?.assumptions[0].decision === 'rejected');
check('reject asumsi: item diflag NEEDS_REVIEW (tidak dihapus diam-diam)', rejectedAssumptionItem?.status === 'NEEDS_REVIEW');

const verifiedWall = confirmItem(createReviewState([wallWithAssumption]), wallWithAssumption.id).state;
const rejectOnVerified = rejectAssumption(verifiedWall, wallWithAssumption.id, assumptionId);
check('reject asumsi pada item VERIFIED → NEEDS_REVIEW (dasar digugat)', rejectOnVerified.ok && reviewItemById(rejectOnVerified.state, wallWithAssumption.id)?.status === 'NEEDS_REVIEW');

const rejectedWallState = rejectItem(createReviewState([wallWithAssumption]), wallWithAssumption.id, 'Dinding tidak ada di denah').state;
const rejectOnRejected = rejectAssumption(rejectedWallState, wallWithAssumption.id, assumptionId);
check('reject asumsi pada item NOT_DETECTED: status tetap NOT_DETECTED', rejectOnRejected.ok && reviewItemById(rejectOnRejected.state, wallWithAssumption.id)?.status === 'NOT_DETECTED');

/* ------------------------------------------------------------------ */
/* jumpTarget + bboxToPercent                                          */
/* ------------------------------------------------------------------ */
const jumpDim = jumpTarget(dimItem);
check('jumpTarget dengan bbox → { page 3, bbox }', jumpDim !== null && jumpDim.page === 3 && jumpDim.bbox !== null && jumpDim.bbox.x === 100);
const jumpLive = jumpTarget(liveNull);
check('jumpTarget tanpa bbox → { page, bbox null } (lompat halaman saja)', jumpLive !== null && jumpLive.page === 3 && jumpLive.bbox === null);
const liveNoPage = reviewItemFromDedAiItem(makeLiveItem({ sourcePages: [] }));
check('jumpTarget tanpa halaman → null', jumpTarget(liveNoPage) === null);

const pct = bboxToPercent({ x: 100, y: 200, width: 300, height: 40 }, 1000, 2000);
check('bboxToPercent: 100/200/300/40 pada 1000×2000 → 10/10/30/2 %',
  pct !== null && pct.leftPct === 10 && pct.topPct === 10 && pct.widthPct === 30 && pct.heightPct === 2);
const pctClamp = bboxToPercent({ x: 900, y: 1900, width: 300, height: 200 }, 1000, 2000);
check('bboxToPercent: bbox keluar gambar di-clamp ke batas (90/95/10/5 %)',
  pctClamp !== null && pctClamp.leftPct === 90 && pctClamp.topPct === 95 && pctClamp.widthPct === 10 && pctClamp.heightPct === 5);
check('bboxToPercent: ukuran gambar 0 → null', bboxToPercent({ x: 0, y: 0, width: 10, height: 10 }, 0, 2000) === null);
check('bboxToPercent: bbox lebar 0 → null', bboxToPercent({ x: 10, y: 10, width: 0, height: 10 }, 1000, 2000) === null);
check('bboxToPercent: bbox NaN → null', bboxToPercent({ x: NaN, y: 10, width: 10, height: 10 }, 1000, 2000) === null);

/* ------------------------------------------------------------------ */
/* Helpers: counts + itemsOnPage                                       */
/* ------------------------------------------------------------------ */
const mixed = createReviewState([dimItem, openingItem, liveNull, wallItem]);
const counts = reviewCounts(mixed);
check('reviewCounts: total 4, UNRESOLVED 1', counts.total === 4 && counts.byStatus.UNRESOLVED === 1);
check('reviewCounts: byColor green 3 (0.92/0.95/1.0), red 1 (0.0)',
  counts.byColor.green === 3 && counts.byColor.red === 1 && counts.byColor.yellow === 0);
check('itemsOnPage(3) = 4 item, itemsOnPage(5) = 0', itemsOnPage(mixed, 3).length === 4 && itemsOnPage(mixed, 5).length === 0);

/* ------------------------------------------------------------------ */
/* Viewer smoke import (tanpa render DOM)                              */
/* ------------------------------------------------------------------ */
check('viewer: DedVisionReviewViewer diekspor sebagai fungsi/komponen', typeof DedVisionReviewViewer === 'function');
check('viewer: DEDVR_ZOOM_MIN = 0.5', DEDVR_ZOOM_MIN === 0.5);
check('viewer: DEDVR_ZOOM_MAX = 3', DEDVR_ZOOM_MAX === 3);
check('viewer: DEDVR_ZOOM_STEP = 0.25', DEDVR_ZOOM_STEP === 0.25);

const totalChecks = pass + fail;
console.log(`\nPASS ${pass}/${totalChecks}`);
if (fail > 0) process.exit(1);

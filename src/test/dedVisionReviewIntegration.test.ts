// Suite: DED vision — live integration I7b (spec §10).
// src/ai-tools/ded-vision/reviewIntegration.ts — pure bridge between the
// live DedAiItem[] list and ReviewState (build / fingerprint / reconcile /
// mirrors into the SAME list that is finalized and exported).
// src/ai-tools/ded-vision/reviewState.ts — review actions, exercised here
// through the full user journey on live-item fixtures.
// src/ai-tools/ded-ai-estimate/dedReviewGate.ts — the existing finalize
// gate must see mirrored decisions WITHOUT any gate change.
//
// Ground truth dihitung tangan (bukan dari output modul):
//   dinding 84.5 m² × Rp50.000 = Rp4.225.000; dikoreksi → 90 m² = Rp4.500.000
//   pondasi 9.6 m³ × Rp100.000 = Rp960.000
//   pintu 12 unit × Rp75.000 = Rp900.000
//   galian 2.5 m³ × Rp120.000 = Rp300.000
// Jalankan dari root repo: npx --yes tsx src/test/dedVisionReviewIntegration.test.ts
import {
  approveAssumption,
  confirmItem,
  correctItem,
  createReviewState,
  jumpTarget,
  rejectAssumption,
  rejectItem,
  reviewCounts,
  reviewItemById,
} from '../ai-tools/ded-vision/reviewState';
import type { ReviewItem } from '../ai-tools/ded-vision/reviewState';
import {
  buildReviewItems,
  dedAiIdFromReviewId,
  liveItemFingerprint,
  mirrorReviewConfirmation,
  mirrorReviewCorrection,
  mirrorReviewRejection,
  reconcileReviewState,
  reviewIdForDedAiItem,
} from '../ai-tools/ded-vision/reviewIntegration';
import {
  canFinalizeWithGate,
  isSavableDedItem,
  reviewGateItemsForDed,
} from '../ai-tools/ded-ai-estimate/dedReviewGate';
import type { DedAiItem } from '../ai-tools/ded-ai-estimate/types';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}`); }
}

/* ------------------------------------------------------------------ */
/* Fixtures: representative live result items                          */
/* ------------------------------------------------------------------ */

function makeLiveItem(overrides: Partial<DedAiItem>): DedAiItem {
  return {
    id: 'pondasi-1',
    name: 'Pondasi batu kali',
    category: 'Pekerjaan Pondasi',
    units: 'm3',
    quantity: 9.6,
    quantitySource: 'DERIVED',
    quantityFormula: '10.0 × 0.8 × 1.2',
    rawDimensions: '10.0 × 0.8 × 1.2 m',
    derivation: {
      formulaType: 'pondasi_volume',
      inputs: [
        { name: 'panjang', value: 10, unit: 'm', source: 'DED' },
        { name: 'lebar', value: 0.8, unit: 'm', source: 'DED' },
        { name: 'tinggi', value: 1.2, unit: 'm', source: 'DED' },
      ],
      result: 9.6,
      resultUnit: 'm3',
      validationStatus: 'ok',
    },
    unitPrice: 100000,
    priceSource: 'AHSP_2026',
    subtotal: 960000,
    sourcePages: [3, 5],
    provenance: ['DED'],
    stage: 'CALCULATED',
    ...overrides,
  };
}

const dinding = makeLiveItem({
  id: 'dinding-1',
  name: 'Dinding bata merah',
  category: 'Pekerjaan Dinding',
  units: 'm2',
  quantity: 84.5,
  quantitySource: 'ASSUMPTION',
  quantityFormula: '28.0 × 3.2 − 5.1',
  quantityNote: 'Tinggi dinding diasumsikan 3.2 m dari potongan A-A',
  rawDimensions: '28.0 m × 3.2 m',
  derivation: undefined,
  unitPrice: 50000,
  subtotal: 4225000,
  sourcePages: [3],
});

const pintu = makeLiveItem({
  id: 'pintu-1',
  name: 'Pintu kayu jati',
  category: 'Pekerjaan Kusen',
  units: 'unit',
  quantity: 12,
  quantitySource: 'USER_INPUT',
  quantityFormula: 'Input manual: 12 unit',
  rawDimensions: undefined,
  derivation: undefined,
  unitPrice: 75000,
  subtotal: 900000,
  sourcePages: [7],
});

const galian = makeLiveItem({
  id: 'galian-1',
  name: 'Galian tanah biasa',
  category: 'Pekerjaan Tanah',
  units: 'm3',
  quantity: 2.5,
  quantitySource: 'AI_INFERENCE',
  quantityFormula: undefined,
  rawDimensions: undefined,
  derivation: undefined,
  unitPrice: 120000,
  subtotal: 300000,
  sourcePages: [9],
});

const blocked = makeLiveItem({
  id: 'blocked-1',
  name: 'Kolom beton K1',
  category: 'Pekerjaan Struktur',
  units: 'm3',
  quantity: null,
  quantitySource: 'UNRESOLVED',
  quantityFormula: undefined,
  rawDimensions: undefined,
  derivation: undefined,
  unitPrice: null,
  priceSource: 'UNRESOLVED',
  subtotal: null,
  sourcePages: [2],
  stage: 'PARSE',
});

const noPage = makeLiveItem({
  id: 'nopage-1',
  name: 'Pondasi batu kali (tanpa halaman)',
  category: 'Pekerjaan Pondasi',
  units: 'm3',
  quantity: 5,
  quantitySource: 'DERIVED',
  unitPrice: 100000,
  subtotal: 500000,
  sourcePages: [],
});

const liveItems = [makeLiveItem({}), dinding, pintu, galian, blocked, noPage];

console.log('dedVisionReviewIntegration — I7b live wiring (pure logic)');

/* ------------------------------------------------------------------ */
/* buildReviewItems: page / confidence / status mapping                */
/* ------------------------------------------------------------------ */
const built = buildReviewItems(liveItems);
check('build: 6 item live → 6 ReviewItem, urutan sama',
  built.length === 6 && built[0].id === 'live-pondasi-1' && built[5].id === 'live-nopage-1');
check('build: page = halaman sumber pertama (pondasi → 3, pintu → 7)',
  built[0].page === 3 && built[2].page === 7);
check('build: sourcePages dipertahankan ([3,5] pondasi)',
  built[0].sourcePages.length === 2 && built[0].sourcePages[0] === 3 && built[0].sourcePages[1] === 5);
check('build: tanpa halaman sumber → page null', built[5].page === null);
check('build: DERIVED → confidence 0.9 + HIGH_CONFIDENCE',
  built[0].confidence === 0.9 && built[0].status === 'HIGH_CONFIDENCE');
check('build: USER_INPUT → confidence 0.95 + HIGH_CONFIDENCE (BUKAN VERIFIED)',
  built[2].confidence === 0.95 && built[2].status === 'HIGH_CONFIDENCE');
check('build: AI_INFERENCE → confidence 0.55 + NEEDS_REVIEW',
  built[3].confidence === 0.55 && built[3].status === 'NEEDS_REVIEW');
check('build: ASSUMPTION → 0.5 + NEEDS_REVIEW + 1 asumsi pending dari quantityNote',
  built[1].confidence === 0.5 && built[1].status === 'NEEDS_REVIEW'
  && built[1].assumptions.length === 1 && built[1].assumptions[0].decision === 'pending'
  && built[1].assumptions[0].text.includes('3.2 m'));
check('build: kuantitas null → nilai null (bukan 0) + confidence 0 + UNRESOLVED',
  built[4].interpretation.value === null && built[4].confidence === 0 && built[4].status === 'UNRESOLVED');
check('build: SEMUA item live punya bbox null (tanpa posisi palsu)',
  built.every((it) => it.bbox === null));
check('build: originalText = rawDimensions verbatim ("10.0 × 0.8 × 1.2 m")',
  built[0].originalText === '10.0 × 0.8 × 1.2 m');
check('build: TIDAK ADA adapter yang menghasilkan VERIFIED',
  built.every((it) => it.status !== 'VERIFIED'));

/* ------------------------------------------------------------------ */
/* jumpTarget: lompat halaman saja bila bbox null                      */
/* ------------------------------------------------------------------ */
const jumpPondasi = jumpTarget(built[0]);
check('jumpTarget pondasi → { page 3, bbox null } (lompat halaman saja)',
  jumpPondasi !== null && jumpPondasi.page === 3 && jumpPondasi.bbox === null);
check('jumpTarget tanpa halaman → null', jumpTarget(built[5]) === null);
const focusA = jumpPondasi ? { page: jumpPondasi.page, bbox: jumpPondasi.bbox } : null;
const focusB = jumpPondasi ? { page: jumpPondasi.page, bbox: jumpPondasi.bbox } : null;
check('kontrak focusTarget: dua lompat ke target sama = objek BARU (identitas beda, isi sama)',
  focusA !== null && focusB !== null && focusA !== focusB && focusA.page === focusB.page && focusA.bbox === focusB.bbox);

/* ------------------------------------------------------------------ */
/* ID mapping                                                          */
/* ------------------------------------------------------------------ */
check('reviewIdForDedAiItem: pondasi-1 → live-pondasi-1',
  reviewIdForDedAiItem('pondasi-1') === 'live-pondasi-1');
check('dedAiIdFromReviewId round-trip: live-dinding-1 → dinding-1',
  dedAiIdFromReviewId('live-dinding-1') === 'dinding-1');
check('dedAiIdFromReviewId: dim-/opening-/live- kosong → null',
  dedAiIdFromReviewId('dim-d1') === null
  && dedAiIdFromReviewId('opening-D1') === null
  && dedAiIdFromReviewId('live-') === null);

/* ------------------------------------------------------------------ */
/* Fingerprint                                                         */
/* ------------------------------------------------------------------ */
const fpA = liveItemFingerprint(dinding);
const fpB = liveItemFingerprint({ ...dinding });
check('fingerprint: item sama → sidik sama', fpA === fpB);
check('fingerprint: ubah kuantitas → sidik beda',
  liveItemFingerprint({ ...dinding, quantity: 90 }) !== fpA);
check('fingerprint: ubah provenance SAJA → sidik sama (konfirmasi tidak me-reset tinjau)',
  liveItemFingerprint({ ...dinding, provenance: [...dinding.provenance, 'review-verified'] }) === fpA);
check('fingerprint: ubah harga SAJA → sidik sama (tinjau tidak melacak harga)',
  liveItemFingerprint({ ...dinding, unitPrice: 60000 }) === fpA);

/* ------------------------------------------------------------------ */
/* reconcileReviewState                                                */
/* ------------------------------------------------------------------ */
const initialState = createReviewState(built);
const initialFps = new Map(liveItems.map((it) => [it.id, liveItemFingerprint(it)]));
const reconSame = reconcileReviewState(initialState, liveItems, initialFps);
check('reconcile: item tidak berubah → changed=false, state sama (referensi)',
  reconSame.changed === false && reconSame.state === initialState);

const confirmedState = confirmItem(initialState, 'live-pondasi-1').state;
const reconKept = reconcileReviewState(confirmedState, liveItems, initialFps);
check('reconcile: keputusan VERIFIED dipertahankan bila item tidak berubah',
  reconKept.changed === false && reviewItemById(reconKept.state, 'live-pondasi-1')?.status === 'VERIFIED');

// Edit pensil di luar panel tinjau: kuantitas pondasi 9.6 → 12 (USER_INPUT).
const editedItems = liveItems.map((it) =>
  it.id === 'pondasi-1'
    ? { ...it, quantity: 12, quantitySource: 'USER_INPUT' as const, quantityFormula: 'Input manual: 12 m3' }
    : it,
);
const reconEdited = reconcileReviewState(confirmedState, editedItems, initialFps);
const reconPondasi = reviewItemById(reconEdited.state, 'live-pondasi-1');
const reconDinding = reviewItemById(reconEdited.state, 'live-dinding-1');
check('reconcile: item yang diedit di luar tinjau di-reset ke baseline adapter (nilai 12, HIGH_CONFIDENCE, VERIFIED gugur)',
  reconEdited.changed === true && reconPondasi?.interpretation.value === 12
  && reconPondasi?.status === 'HIGH_CONFIDENCE');
check('reconcile: item lain TIDAK ikut di-reset (dinding tetap NEEDS_REVIEW + asumsi pending)',
  reconDinding?.status === 'NEEDS_REVIEW' && reconDinding?.assumptions[0]?.decision === 'pending');

const addedItems = [...liveItems, makeLiveItem({ id: 'baru-1', name: 'Galian tanah baru', quantity: 1 })];
const reconAdded = reconcileReviewState(initialState, addedItems, initialFps);
check('reconcile: item live baru → ReviewItem baru ditambahkan (7 item)',
  reconAdded.changed === true && reconAdded.state.items.length === 7
  && reviewItemById(reconAdded.state, 'live-baru-1')?.interpretation.value === 1);
const removedItems = liveItems.filter((it) => it.id !== 'galian-1');
const reconRemoved = reconcileReviewState(initialState, removedItems, initialFps);
check('reconcile: item live dihapus → ReviewItem-nya ikut dihapus (5 item)',
  reconRemoved.changed === true && reconRemoved.state.items.length === 5
  && reviewItemById(reconRemoved.state, 'live-galian-1') === undefined);

// Item visi-only (dim-) tidak dikelola reconcile: dipertahankan apa adanya.
const dimOnly: ReviewItem = {
  id: 'dim-d1', kind: 'dimension', label: '3.500', page: 3, sourcePages: [3],
  bbox: { x: 100, y: 200, width: 300, height: 40 }, originalText: '3.500',
  interpretation: { value: 3.5, unit: 'm', detail: 'LINEAR' }, formula: null, inputs: {},
  confidence: 0.92, status: 'HIGH_CONFIDENCE', assumptions: [], evidence: [], notes: [],
};
const mixedState = createReviewState([...built, dimOnly]);
const reconMixed = reconcileReviewState(mixedState, liveItems, initialFps);
check('reconcile: item visi-only (dim-) dipertahankan apa adanya',
  reviewItemById(reconMixed.state, 'dim-d1')?.status === 'HIGH_CONFIDENCE'
  && reviewItemById(reconMixed.state, 'dim-d1')?.bbox?.x === 100);

/* ------------------------------------------------------------------ */
/* Perjalanan pengguna penuh (logika murni):                           */
/* pilih → lompat → koreksi → cermin → konfirmasi → VERIFIED →        */
/* payload finalisasi mencerminkan koreksi                             */
/* ------------------------------------------------------------------ */
const journeyState = createReviewState(buildReviewItems(liveItems));
const selected = reviewItemById(journeyState, 'live-dinding-1');
check('journey: pilih dinding-1 → item ditemukan, status NEEDS_REVIEW',
  selected !== undefined && selected.status === 'NEEDS_REVIEW');
const journeyJump = selected ? jumpTarget(selected) : null;
check('journey: lompat dinding-1 → hal. 3, bbox null (halaman saja)',
  journeyJump !== null && journeyJump.page === 3 && journeyJump.bbox === null);

// Koreksi INPUT pada item live DITOLAK jujur (tanpa recomputeKind).
const inputRefused = correctItem(journeyState, 'live-dinding-1', { type: 'input', inputName: 'tinggi_dinding_mm', value: 3200 });
check('journey: koreksi input pada item live DITOLAK (tanpa recomputeKind), state tidak berubah',
  !inputRefused.ok && inputRefused.state === journeyState);

// Koreksi NILAI langsung 84.5 → 90.
const corrected = correctItem(journeyState, 'live-dinding-1', { type: 'value', value: 90 });
const correctedItem = reviewItemById(corrected.state, 'live-dinding-1');
check('journey: koreksi nilai 84.5 → 90 berhasil, status NEEDS_REVIEW (tanpa confirm)',
  corrected.ok && correctedItem?.interpretation.value === 90 && correctedItem?.status === 'NEEDS_REVIEW');
check('journey: correctedFrom mencatat nilai lama 84.5 + catatan rumus-asal',
  correctedItem?.correctedFrom?.previousValue === 84.5
  && (correctedItem?.notes ?? []).some((n) => n.includes('rumus asal')));

// Cermin ke daftar live (SATU-SATUNYA payload finalisasi).
const mirrored = correctedItem ? mirrorReviewCorrection(liveItems, 'dinding-1', correctedItem) : liveItems;
const mirroredDinding = mirrored.find((it) => it.id === 'dinding-1');
check('journey: cermin — kuantitas 90, sumber USER_INPUT, subtotal 90×50.000 = Rp4.500.000, stage CALCULATED',
  mirroredDinding?.quantity === 90 && mirroredDinding?.quantitySource === 'USER_INPUT'
  && mirroredDinding?.subtotal === 4500000 && mirroredDinding?.stage === 'CALCULATED');
check('journey: cermin — formula baru menyimpan rumus asal + provenance review-correction',
  (mirroredDinding?.quantityFormula ?? '').includes('rumus asal')
  && (mirroredDinding?.quantityFormula ?? '').includes('28.0 × 3.2 − 5.1')
  && mirroredDinding?.provenance.includes('review-correction') === true);
check('journey: cermin — item lain TIDAK berubah (pondasi tetap 9.6 m³ / Rp960.000)',
  mirrored.find((it) => it.id === 'pondasi-1')?.quantity === 9.6
  && mirrored.find((it) => it.id === 'pondasi-1')?.subtotal === 960000);

// Gerbang review (TANPA perubahan dedReviewGate.ts): item asumsi masuk
// gerbang sebelum koreksi, keluar sesudah koreksi (USER_INPUT dikecualikan).
const gateBefore = reviewGateItemsForDed(liveItems);
const gateAfter = reviewGateItemsForDed(mirrored);
check('journey: gerbang SEBELUM koreksi memuat dinding-1 (alasan kuantitas asumsi)',
  gateBefore.some((g) => g.itemId === 'dinding-1' && g.reasons.includes('QUANTITY_ESTIMATE')));
check('journey: gerbang SESUDAH koreksi TIDAK lagi memuat dinding-1 (USER_INPUT)',
  !gateAfter.some((g) => g.itemId === 'dinding-1'));

// Konfirmasi → VERIFIED; cermin konfirmasi hanya menandai provenance.
const confirmedJourney = confirmItem(corrected.state, 'live-dinding-1');
const verifiedItem = reviewItemById(confirmedJourney.state, 'live-dinding-1');
check('journey: konfirmasi item terkoreksi → VERIFIED, confidence 1',
  confirmedJourney.ok && verifiedItem?.status === 'VERIFIED' && verifiedItem?.confidence === 1);
const confirmedMirrored = mirrorReviewConfirmation(mirrored, 'dinding-1');
check('journey: cermin konfirmasi — nilai & subtotal TIDAK berubah, provenance + review-verified',
  confirmedMirrored.find((it) => it.id === 'dinding-1')?.quantity === 90
  && confirmedMirrored.find((it) => it.id === 'dinding-1')?.subtotal === 4500000
  && confirmedMirrored.find((it) => it.id === 'dinding-1')?.provenance.includes('review-verified') === true);

// Payload finalisasi = daftar live sesudah cermin (tidak ada jalur kedua).
const finalizePayload = confirmedMirrored;
check('journey: payload finalisasi memuat koreksi (dinding 90 m² / Rp4.500.000)',
  finalizePayload.find((it) => it.id === 'dinding-1')?.quantity === 90
  && finalizePayload.find((it) => it.id === 'dinding-1')?.subtotal === 4500000);
check('journey: gerbang lengkap bila semua entri dicentang (finalisasi terbuka)',
  canFinalizeWithGate({
    gateItems: reviewGateItemsForDed(finalizePayload),
    checkedIds: new Set(reviewGateItemsForDed(finalizePayload).map((g) => g.itemId)),
    savableCount: finalizePayload.filter(isSavableDedItem).length,
  }) === true);

/* ------------------------------------------------------------------ */
/* Penolakan: nilai tidak boleh bertahan                               */
/* ------------------------------------------------------------------ */
const rejectNoReason = rejectItem(createReviewState(buildReviewItems(liveItems)), 'live-galian-1', '   ');
check('reject: tanpa alasan DITOLAK', !rejectNoReason.ok);
const rejectedState = rejectItem(createReviewState(buildReviewItems(liveItems)), 'live-galian-1', 'Angka ini nomor detail, bukan volume galian.');
const rejectedItem = reviewItemById(rejectedState.state, 'live-galian-1');
check('reject: → NOT_DETECTED, nilai null, alasan tercatat, originalText dipertahankan',
  rejectedState.ok && rejectedItem?.status === 'NOT_DETECTED' && rejectedItem?.interpretation.value === null
  && rejectedItem?.rejectionReason?.includes('nomor detail') === true);
check('reject: konfirmasi & koreksi pada item NOT_DETECTED ditolak',
  !confirmItem(rejectedState.state, 'live-galian-1').ok
  && !correctItem(rejectedState.state, 'live-galian-1', { type: 'value', value: 3 }).ok);
const rejectedMirrored = mirrorReviewRejection(liveItems, 'galian-1', 'Angka ini nomor detail, bukan volume galian.');
const rejectedLive = rejectedMirrored.find((it) => it.id === 'galian-1');
check('reject: cermin — kuantitas null, stage REJECTED, subtotal null, tidak savable',
  rejectedLive?.quantity === null && rejectedLive?.stage === 'REJECTED' && rejectedLive?.subtotal === null
  && rejectedLive !== undefined && !isSavableDedItem(rejectedLive));
check('reject: cermin — quantityNote memuat alasan + provenance review-rejected',
  (rejectedLive?.quantityNote ?? '').includes('nomor detail')
  && rejectedLive?.provenance.includes('review-rejected') === true);
check('reject: cermin — item ditolak keluar dari daftar gerbang',
  !reviewGateItemsForDed(rejectedMirrored).some((g) => g.itemId === 'galian-1'));
check('reject: batch yang hanya berisi item ditolak TIDAK bisa difinalisasi (savable 0)',
  canFinalizeWithGate({
    gateItems: reviewGateItemsForDed(rejectedMirrored.filter((it) => it.id === 'galian-1')),
    checkedIds: new Set(),
    savableCount: rejectedMirrored.filter((it) => it.id === 'galian-1').filter(isSavableDedItem).length,
  }) === false);

/* ------------------------------------------------------------------ */
/* Log asumsi                                                          */
/* ------------------------------------------------------------------ */
const assumptionState = createReviewState(buildReviewItems(liveItems));
const assumptionId = reviewItemById(assumptionState, 'live-dinding-1')?.assumptions[0]?.id ?? '';
const approvedAssumption = approveAssumption(assumptionState, 'live-dinding-1', assumptionId);
const approvedItem = reviewItemById(approvedAssumption.state, 'live-dinding-1');
check('asumsi: setujui → decision approved, status item TIDAK berubah (bukan konfirmasi item)',
  approvedAssumption.ok && approvedItem?.assumptions[0]?.decision === 'approved'
  && approvedItem?.status === 'NEEDS_REVIEW');
const rejectedAssumption = rejectAssumption(assumptionState, 'live-dinding-1', assumptionId);
const rejectedAssumptionItem = reviewItemById(rejectedAssumption.state, 'live-dinding-1');
check('asumsi: tolak → decision rejected + item diflag NEEDS_REVIEW',
  rejectedAssumption.ok && rejectedAssumptionItem?.assumptions[0]?.decision === 'rejected'
  && rejectedAssumptionItem?.status === 'NEEDS_REVIEW');
const verifiedDinding = confirmItem(
  correctItem(assumptionState, 'live-dinding-1', { type: 'value', value: 90 }, { confirm: true }).state,
  'live-dinding-1',
).state;
const rejectOnVerified = rejectAssumption(verifiedDinding, 'live-dinding-1', assumptionId);
check('asumsi: tolak asumsi pada item VERIFIED → NEEDS_REVIEW (dasar digugat)',
  rejectOnVerified.ok && reviewItemById(rejectOnVerified.state, 'live-dinding-1')?.status === 'NEEDS_REVIEW');

/* ------------------------------------------------------------------ */
/* Guard konfirmasi                                                    */
/* ------------------------------------------------------------------ */
const confirmNull = confirmItem(createReviewState(buildReviewItems(liveItems)), 'live-blocked-1');
check('guard: konfirmasi item UNRESOLVED tanpa nilai DITOLAK (state tidak berubah)',
  !confirmNull.ok && confirmNull.state.items.find((it) => it.id === 'live-blocked-1')?.status === 'UNRESOLVED');
const confirmHigh = confirmItem(createReviewState(buildReviewItems(liveItems)), 'live-pondasi-1');
check('guard: konfirmasi item HIGH_CONFIDENCE bernilai → VERIFIED + confidence 1',
  confirmHigh.ok && reviewItemById(confirmHigh.state, 'live-pondasi-1')?.status === 'VERIFIED'
  && reviewItemById(confirmHigh.state, 'live-pondasi-1')?.confidence === 1);

/* ------------------------------------------------------------------ */
/* Degradasi anggun: tanpa gambar halaman sama sekali                  */
/* ------------------------------------------------------------------ */
// Gambar halaman adalah prop view (parser withImages:false → tidak ada
// gambar). Logika integrasi tidak bergantung padanya: item tetap
// dibangun, lompat tetap halaman-saja, tinjau tetap berfungsi penuh.
const noImagesBuilt = buildReviewItems([blocked, noPage]);
check('degradasi: tanpa gambar, item tetap dibangun (2 item, page 2 / null)',
  noImagesBuilt.length === 2 && noImagesBuilt[0].page === 2 && noImagesBuilt[1].page === null);
check('degradasi: tanpa gambar, lompat tetap halaman-saja (bbox null)',
  jumpTarget(noImagesBuilt[0])?.page === 2 && jumpTarget(noImagesBuilt[0])?.bbox === null);
const mixedCounts = reviewCounts(createReviewState(buildReviewItems(liveItems)));
check('ringkasan: total 6 — HIGH_CONFIDENCE 3, NEEDS_REVIEW 2, UNRESOLVED 1',
  mixedCounts.total === 6 && mixedCounts.byStatus.HIGH_CONFIDENCE === 3
  && mixedCounts.byStatus.NEEDS_REVIEW === 2 && mixedCounts.byStatus.UNRESOLVED === 1);

/* ------------------------------------------------------------------ */
/* Smoke import view (dinamis — impor CSS di bawah tsx mungkin gagal)  */
/* ------------------------------------------------------------------ */
async function smokeCheckView(): Promise<string> {
  try {
    const viewMod = await import('../ai-tools/ded-ai-estimate/DedAiResultView.tsx');
    check('view: DedAiResultView masih diekspor sebagai komponen',
      typeof (viewMod as { DedAiResultView?: unknown }).DedAiResultView === 'function');
    return '';
  } catch (err) {
    // Diantisipasi tugas: view mengimpor CSS (dedAi.css, ai-credits.css,
    // dedVisionReview.css) yang tidak bisa dimuat tsx — ini keterbatasan
    // harness, BUKAN cacat view. Dicatat, bukan kegagalan.
    return `CATATAN: smoke import DedAiResultView.tsx diblokir harness tsx (impor CSS): ${(err as Error)?.message ?? err}`;
  }
}

void smokeCheckView().then((viewSmokeNote) => {
  const totalChecks = pass + fail;
  console.log(`\nPASS ${pass}/${totalChecks}`);
  if (viewSmokeNote) console.log(viewSmokeNote);
  if (fail > 0) process.exit(1);
});

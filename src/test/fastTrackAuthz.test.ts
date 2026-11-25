/**
 * fastTrackAuthz — pin perilaku baru program EZRAB Fast Track Completion
 * (W-AUTH2, 2026-11-24), dikelompokkan per tugas:
 *
 * - §1 Tugas 1 (P1-08 penuh / H-12): accept-before-persist Full AI —
 *   completion menahan isian di klon tertunda; HANYA terima yang
 *   menempelkannya ke draft live; buang tidak menyentuh draft.
 *   (Pin dasar terima/buang/undo juga ada di p1AuthzConfirmation §6;
 *   di sini pin KHUSUS: tanpa panggilan AI ulang saat pending, dan
 *   penolakan terima bila draft live sudah berganti.)
 * - §2 Tugas 2 (P1-04/P1-05): preview binding PUSH_ANSWER_ITEMS —
 *   sidik atas nilai persis yang ditulis, slot konfirmasi sekali pakai
 *   + TTL (infrastruktur perintah langsung yang sama), pesan pratinjau
 *   menampilkan nilai terikat. (Alur klik tombol hidup di view.tsx —
 *   tidak dapat diuji tsx; yang diuji di sini adalah primitif registry
 *   yang dipakai alur itu.)
 * - §3 Tugas 3 (§3(g)): penjaga level-registry terhadap ensurer yang
 *   membuat proyek — `created: true` dibuang (null), draft tetap tak
 *   terikat; ensurer non-pembuat diteruskan.
 * - §4 Tugas 4 (§7): gerbang kapabilitas empat entri draft-scope —
 *   FULL_AI_COMPLETE, REVISION_ACTIVATE, QTO_CORRECTION,
 *   DED_SPEC_REVISION digerbang `edit-estimate`.
 * - §5 Tugas 5 (H-09): push direct-RAB lewat kontrak transfer S2 —
 *   OFFICIAL membawa OFFICIAL_AHSP + VERIFIED; BENCHMARK tetap
 *   ESTIMATED + NEEDS_VERIFICATION tanpa kind.
 * - §6 Fast Track Continuation A2 (2026-11-24): pratinjau lengkapan
 *   Full AI bertenggat 10 menit + terima menolak bila draft/hasil
 *   live berubah sesudah proposal (sidik isi); completion ulang
 *   sesudah perubahan menjalankan AI segar (bukan ajuan-ulang basi).
 *
 * Suite tsx polos (BUKAN vitest): AI `execute` SELALU di-stub lewat
 * injeksi deps — tanpa live gateway, tanpa network, tanpa paid call.
 * Jalankan: npx --yes tsx src/test/fastTrackAuthz.test.ts
 */
import {
  executeBudgetFullAiRab,
  acceptFullAiCompletion,
  discardFullAiCompletion,
  proposeUiActionConfirmation,
  claimUiActionConfirmation,
  takeUiActionConfirmationRef,
  buildAnswerPushFingerprint,
  formatAnswerPushPreviewMessage,
  clearPendingDirectConfirmations,
  __clearFullAiCompletionSnapshotForTests,
  __hasPendingFullAiCompletionForTests,
  __getPendingUniversalCompletionForTests,
  __getPendingDirectCompletionForTests,
  DIRECT_COMMAND_CONFIRM_TTL_MS,
  type ChatActionContext,
} from '../ai-tools/ezrab-ai/actionRegistry';
import type { AnswerTransferPlan, ChatAnswerPushItem } from '../ai-tools/ezrab-ai/chatAnswerTransfer';
import {
  buildUniversalDraft,
  setLastUniversalDraft,
  getLastUniversalDraft,
  effectiveItems,
  type UniversalDraft,
} from '../ai-tools/ezrab-ai/universalRab';
import { buildDirectRab, type DirectRabResult } from '../ai-tools/ezrab-ai/directRab';
import { mapDirectRabPushItems } from '../ai-tools/ezrab-ai/directRabPush';
import {
  setDraftProjectEnsurer,
  getDraftProjectEnsurer,
  type DraftProjectEnsurer,
} from '../ai-tools/ezrab-ai/tempProject';
import {
  MUTATION_INVENTORY,
  authorizeChatAiMutation,
} from '../ai-tools/ezrab-ai/mutationInventory';
import type { ChatRabCompletionDeps } from '../ai-tools/ezrab-ai/fullAiRabCompletion';

/* ------------------------------------------------------------------ */
/* Harness                                                             */
/* ------------------------------------------------------------------ */

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    passed++;
    console.log(`  PASS ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const MIN_CTX = {
  navigate: () => {},
  currentMenu: 'chat',
  activeProject: null,
  projects: [],
  projectTotal: null,
} as unknown as ChatActionContext;

function buildGudangDraft(budgetText: string): UniversalDraft {
  const built = buildUniversalDraft(`buatkan rab gudang 10 x 20 m budget ${budgetText}`);
  if (built.kind !== 'draft') throw new Error(`gudang draft gagal dibangun: ${built.kind}`);
  return built.draft;
}

function nullPricesWhere(
  draft: UniversalDraft,
  pred: (it: { description: string; unit: string }) => boolean,
): number {
  let nulled = 0;
  for (const part of draft.parts) {
    for (const gen of part.generation.items) {
      if (!pred(gen)) continue;
      gen.unitPrice = null;
      gen.amount = null;
      gen.totalPrice = null;
      gen.priceStatus = 'PRICE_UNRESOLVED';
      gen.priceSourceKind = 'UNRESOLVED';
      nulled++;
    }
  }
  return nulled;
}

/** Stub AI yang menghitung berapa kali dipanggil (pin tanpa-AI-ulang). */
function makeCountingStub(): { deps: ChatRabCompletionDeps; calls: { n: number } } {
  const calls = { n: 0 };
  const execute = async (req: { prompt: string; systemPrompt?: string }): Promise<Record<string, unknown>> => {
    calls.n++;
    const prompt = String(req.prompt ?? '');
    const isPrice = prompt.includes('ISI HARGA SATUAN');
    const items: Array<{ no: number; unit: string }> = [];
    const re = /- no (\d+): "[^"]*" \(satuan: ([^;]+);/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(prompt)) !== null) {
      items.push({ no: Number(m[1]), unit: m[2].trim() });
    }
    if (isPrice) {
      const fills = items.map(({ no, unit }) => ({
        no,
        unitPrice: 150_000,
        unit,
        spec: `spek stub standar untuk item ${no}`,
        basis: 'harga pasar stub, kualitas standar',
      }));
      return { success: true, content: JSON.stringify({ fills }), structured: null, requestId: 'stub-1' };
    }
    const fills = items.map(({ no }) => ({ no, qty: 10, formula: '10 x 1', basis: 'asumsi stub: 10 satuan tipikal' }));
    return { success: true, content: JSON.stringify({ fills }), structured: null, requestId: 'stub-1' };
  };
  return { deps: { execute: execute as ChatRabCompletionDeps['execute'], productId: 'EZRAB_AI' }, calls };
}

function resetAll(): void {
  __clearFullAiCompletionSnapshotForTests();
  clearPendingDirectConfirmations();
  setDraftProjectEnsurer(null);
  setLastUniversalDraft(null);
}

/* ------------------------------------------------------------------ */
/* §1. Tugas 1 — P1-08 penuh / H-12 (accept-before-persist).           */
/* ------------------------------------------------------------------ */

async function section1(): Promise<void> {
  console.log('== §1. Tugas 1 — accept-before-persist Full AI ==');
  {
    resetAll();
    const draft = buildGudangDraft('800 juta');
    nullPricesWhere(draft, (it) => it.unit === 'm2');
    const beforeJson = JSON.stringify(draft);
    const stub = makeCountingStub();
    const res = await executeBudgetFullAiRab('', MIN_CTX, { deps: stub.deps, target: 'universal' });
    check('FT1-01 completion ok + pratinjau (bukan klaim tersimpan)', res.ok === true && res.message.includes('BELUM diterapkan dan BELUM tersimpan'));
    check('FT1-02 draft live TIDAK BERUBAH sesudah completion', JSON.stringify(draft) === beforeJson);
    check('FT1-03 pending tersedia; klon tertunda terisi 2 item', __hasPendingFullAiCompletionForTests('universal') === true && (() => {
      const p = __getPendingUniversalCompletionForTests();
      return p !== null && effectiveItems(p).filter((it) => it.priceStatus === 'PRICE_ESTIMATED').length === 2;
    })());
    // Jalankan ulang saat pending: TANPA panggilan AI lagi.
    const callsBefore = stub.calls.n;
    const res2 = await executeBudgetFullAiRab('', MIN_CTX, { deps: stub.deps, target: 'universal' });
    check('FT1-04 completion ulang saat pending tidak memanggil AI lagi', stub.calls.n === callsBefore && res2.ok === true && res2.message.includes('BELUM diterapkan dan BELUM tersimpan'), `calls ${callsBefore} → ${stub.calls.n}`);
    // Terima dengan draft live yang SUDAH BERGANTI: ditolak, pending dipertahankan.
    const other = buildGudangDraft('500 juta');
    setLastUniversalDraft(other);
    const refused = acceptFullAiCompletion('universal');
    check('FT1-05 terima ditolak bila draft live sudah berganti', refused.ok === false && refused.message.includes('sudah berganti'));
    check('FT1-06 pending DIPERTAHANKAN sesudah penolakan', __hasPendingFullAiCompletionForTests('universal') === true);
    // Kembali ke draft semula → terima berhasil.
    setLastUniversalDraft(draft);
    const accept = acceptFullAiCompletion('universal');
    check('FT1-07 terima berhasil sesudah kembali ke draft semula', accept.ok === true);
    const live = getLastUniversalDraft();
    check('FT1-08 draft live terisi sesudah terima (2 item ESTIMATED)', live !== null && effectiveItems(live).filter((it) => it.priceStatus === 'PRICE_ESTIMATED').length === 2);
    check('FT1-09 pending habis sesudah terima', __hasPendingFullAiCompletionForTests('universal') === false);
  }
  {
    // Jalur buang (universal) + jalur direct.
    resetAll();
    const draft = buildGudangDraft('800 juta');
    nullPricesWhere(draft, (it) => it.unit === 'm2');
    const stub = makeCountingStub();
    await executeBudgetFullAiRab('', MIN_CTX, { deps: stub.deps, target: 'universal' });
    const beforeDiscardJson = JSON.stringify(getLastUniversalDraft());
    const discard = discardFullAiCompletion('universal');
    check('FT1-10 buang berhasil; draft tak berubah; pending hilang', discard.ok === true && JSON.stringify(getLastUniversalDraft()) === beforeDiscardJson && __hasPendingFullAiCompletionForTests('universal') === false);
    check('FT1-11 terima sesudah buang ditolak jujur', acceptFullAiCompletion('universal').ok === false);
    check('FT1-12 buang kedua ditolak jujur (tidak ada pending)', discardFullAiCompletion('universal').ok === false);

    resetAll();
    const built = buildDirectRab('buatkan rab rumah type 36');
    check('FT1-13 buildDirectRab T36 menghasilkan hasil', built !== null);
    const direct = built!;
    const stub2 = makeCountingStub();
    const resD = await executeBudgetFullAiRab('buatkan rab rumah type 36 budget 120 juta', MIN_CTX, { deps: stub2.deps, target: 'direct' });
    check('FT1-14 completion direct ok + fullAiCompletion BELUM terset', resD.ok === true && !direct.fullAiCompletion && __getPendingDirectCompletionForTests() !== null);
    const acceptD = acceptFullAiCompletion('direct');
    check('FT1-15 terima direct berhasil + fullAiCompletion terset', acceptD.ok === true && !!direct.fullAiCompletion);
  }
}

/* ------------------------------------------------------------------ */
/* §2. Tugas 2 — P1-04/P1-05 (preview binding PUSH_ANSWER_ITEMS).      */
/* ------------------------------------------------------------------ */

function section2(): void {
  console.log('== §2. Tugas 2 — preview binding push item jawaban ==');
  const itemA: ChatAnswerPushItem = {
    description: 'Pekerjaan Plesteran Dinding',
    volume: 10,
    unit: 'm2',
    code: '7.3.(1)',
    category: 'Pekerjaan Dinding',
    unitPrice: 125_000,
    priceStatus: 'PRICE_RESOLVED',
    verificationStatus: 'VERIFIED',
    priceSourceKind: 'OFFICIAL_AHSP',
    priceSourceLabel: 'AHSP 2026',
    priceSourceExplanation: 'Koefisien AHSP resmi',
    volumeSource: 'AI_GENERATED',
    ahspCode: '7.3.(1)',
  };
  const itemB: ChatAnswerPushItem = {
    description: 'Pekerjaan Acian',
    volume: 10,
    unit: 'm2',
    code: '7.3.(2)',
    category: 'Pekerjaan Dinding',
    unitPrice: undefined,
    priceStatus: 'PRICE_UNRESOLVED',
    verificationStatus: 'NEEDS_VERIFICATION',
    priceSourceKind: 'UNRESOLVED',
    priceSourceLabel: '',
    priceSourceExplanation: '',
    volumeSource: 'AI_GENERATED',
    ahspCode: '7.3.(2)',
  };
  {
    resetAll();
    const fp1 = buildAnswerPushFingerprint([itemA, itemB], 'p1');
    const fp1b = buildAnswerPushFingerprint([itemA, itemB], 'p1');
    const fpChangedVol = buildAnswerPushFingerprint([{ ...itemA, volume: 11 }, itemB], 'p1');
    const fpChangedProj = buildAnswerPushFingerprint([itemA, itemB], 'p2');
    const fpChangedPrice = buildAnswerPushFingerprint([{ ...itemA, unitPrice: 130_000 }, itemB], 'p1');
    check('FT2-01 sidik deterministik untuk nilai identik', fp1 === fp1b);
    check('FT2-02 sidik berubah bila volume berubah', fpChangedVol !== fp1);
    check('FT2-03 sidik berubah bila proyek tujuan berubah', fpChangedProj !== fp1);
    check('FT2-04 sidik berubah bila harga satuan berubah', fpChangedPrice !== fp1);

    const plan: AnswerTransferPlan = {
      items: [itemA, itemB],
      topCode: '7.3.(1)',
      unknownCodes: ['9.9.(9)'],
      unitMismatchCodes: [],
      skippedAlternatives: 3,
    };
    const msg = formatAnswerPushPreviewMessage(plan, [itemA, itemB], 1, 'Proyek Uji');
    check('FT2-05 pratinjau menampilkan jumlah + nama item', msg.includes('2 item') && msg.includes('Plesteran Dinding') && msg.includes('Acian'));
    check('FT2-06 pratinjau menampilkan volume + harga + total baris', msg.includes('10 m2') && msg.includes('125.000') && msg.includes('1.250.000'));
    check('FT2-07 pratinjau menampilkan proyek tujuan + duplikat + alternatif dilewati', msg.includes('Proyek Uji') && msg.includes('dilewati karena sudah ada') && msg.includes('3 varian lain'));
    check('FT2-08 pratinjau menampilkan kode tak dikenal yang dilewati', msg.includes('9.9.(9)'));
    check('FT2-09 pratinjau menandai item tanpa harga', msg.includes('belum berharga'));

    // Slot konfirmasi: propose → claim cocok → sekali pakai.
    const key = 'answer-push:42';
    const now = Date.now();
    proposeUiActionConfirmation(key, fp1, now);
    const claimed = claimUiActionConfirmation(key, fp1, now + 1000);
    const ref = takeUiActionConfirmationRef(key);
    check('FT2-10 klaim sidik cocok berhasil + ref sekali-baca tersedia', claimed === true && ref === fp1);
    check('FT2-11 klaim kedua (slot habis) ditolak', claimUiActionConfirmation(key, fp1, now + 2000) === false);
    check('FT2-12 ref habis sesudah dibaca sekali', takeUiActionConfirmationRef(key) === null);

    // Sidik berubah (pratinjau basi) → klaim ditolak DAN slot dihapus
    // (semantik perintah langsung yang sudah ada: pemanggil bertanya
    // ulang dengan pratinjau segar).
    proposeUiActionConfirmation(key, fp1, now);
    check('FT2-13 klaim sidik BERUBAH ditolak (pratinjau basi)', claimUiActionConfirmation(key, fpChangedVol, now + 1000) === false);
    check('FT2-14 slot ikut dihapus sesudah klaim basi (klaim benar pun gagal — perlu pratinjau segar)', claimUiActionConfirmation(key, fp1, now + 2000) === false);
    // Proposal ulang dengan sidik yang sama → klaim berhasil lagi.
    proposeUiActionConfirmation(key, fp1, now + 3000);
    check('FT2-14b proposal ulang sesudah klaim basi → klaim berhasil', claimUiActionConfirmation(key, fp1, now + 4000) === true);

    // TTL: klaim sesudah masa berlaku ditolak.
    proposeUiActionConfirmation(key, fp1, now);
    check('FT2-15 klaim sesudah TTL ditolak', claimUiActionConfirmation(key, fp1, now + DIRECT_COMMAND_CONFIRM_TTL_MS + 1) === false);
    // Kunci tak dikenal → klaim ditolak.
    check('FT2-16 klaim kunci tak dikenal ditolak', claimUiActionConfirmation('answer-push:tidak-ada', fp1, now) === false);
  }
}

/* ------------------------------------------------------------------ */
/* §3. Tugas 3 — §3(g) (penjaga registry terhadap ensurer pembuat).    */
/* ------------------------------------------------------------------ */

function section3(): void {
  console.log('== §3. Tugas 3 — penjaga registry ensurer ==');
  {
    resetAll();
    const draft = buildGudangDraft('800 juta');
    const creating: DraftProjectEnsurer = () => ({ id: 'baru-1', name: 'Proyek Baru', created: true });
    setDraftProjectEnsurer(creating);
    const wrapped = getDraftProjectEnsurer();
    check('FT3-01 ensurer terdaftar terbungkus (bukan referensi asli)', wrapped !== null && wrapped !== creating);
    check('FT3-02 ensurer pembuat → null (draft tetap tak terikat)', wrapped !== null && wrapped(draft) === null);
    const live: DraftProjectEnsurer = () => ({ id: 'p-live', name: 'Proyek Live', created: false });
    setDraftProjectEnsurer(live);
    const wrappedLive = getDraftProjectEnsurer();
    const ensured = wrappedLive ? wrappedLive(draft) : null;
    check('FT3-03 ensurer non-pembuat diteruskan utuh', ensured !== null && ensured.id === 'p-live' && ensured.created === false);
    const nulling: DraftProjectEnsurer = () => null;
    setDraftProjectEnsurer(nulling);
    const wrappedNull = getDraftProjectEnsurer();
    check('FT3-04 ensurer null diteruskan null', wrappedNull !== null && wrappedNull(draft) === null);
    setDraftProjectEnsurer(null);
    check('FT3-05 lepas ensurer (null) mengosongkan registry', getDraftProjectEnsurer() === null);
  }
}

/* ------------------------------------------------------------------ */
/* §4. Tugas 4 — §7 (gerbang kapabilitas draft-scope).                 */
/* ------------------------------------------------------------------ */

function section4(): void {
  console.log('== §4. Tugas 4 — gerbang kapabilitas draft-scope ==');
  const keys = ['FULL_AI_COMPLETE', 'REVISION_ACTIVATE', 'QTO_CORRECTION', 'DED_SPEC_REVISION'];
  for (const key of keys) {
    const entry = MUTATION_INVENTORY.find((e) => e.key === key);
    check(`FT4-${key} entri inventaris ada + PERSISTENT`, entry !== undefined && entry!.classification === 'PERSISTENT_MUTATION');
    check(`FT4-${key} digerbang capability edit-estimate`, entry !== undefined && entry!.capability === 'edit-estimate' && entry!.gatedInP1 === true);
    const refused = authorizeChatAiMutation(key, false);
    check(`FT4-${key} tanpa capability DITOLAK`, refused.ok === false);
    const allowed = authorizeChatAiMutation(key, true);
    check(`FT4-${key} dengan capability DIIZINKAN`, allowed.ok === true);
  }
}

/* ------------------------------------------------------------------ */
/* §5. Tugas 5 — H-09 (push direct lewat kontrak transfer S2).         */
/* ------------------------------------------------------------------ */

function section5(): void {
  console.log('== §5. Tugas 5 — H-09 kontrak transfer S2 ==');
  const synth = (over: Partial<DirectRabResult>): DirectRabResult => {
    const base = {
      mode: 'direct',
      userText: 'sintetis',
      projectInfo: { name: 'Sintetis', location: '', areaM2: 10, floors: 1 },
      generation: {
        workItems: [
          { name: 'Pekerjaan Resmi AHSP', wbsCode: 'A.1', quantity: 10, unit: 'm2', ahspCode: 'AHSP-1', workItemId: 'a', category: 'K' },
          { name: 'Pekerjaan Benchmark', wbsCode: 'B.1', quantity: 5, unit: 'm3', ahspCode: '', workItemId: 'b', category: 'K' },
          { name: 'Pekerjaan Tanpa Harga', wbsCode: 'C.1', quantity: 2, unit: 'unit', ahspCode: '', workItemId: 'c', category: 'K' },
        ],
      },
      calc: {
        items: [
          { name: 'Pekerjaan Resmi AHSP', wbsCode: 'A.1', volume: 10, unit: 'm2', unitPrice: 125_000, totalPrice: 1_250_000, priceStatus: 'PRICE_RESOLVED', category: 'K' },
          { name: 'Pekerjaan Benchmark', wbsCode: 'B.1', volume: 5, unit: 'm3', unitPrice: 850_000, totalPrice: 4_250_000, priceStatus: 'BENCHMARK', category: 'K' },
          { name: 'Pekerjaan Tanpa Harga', wbsCode: 'C.1', volume: 2, unit: 'unit', unitPrice: 0, totalPrice: 0, priceStatus: 'PRICE_UNRESOLVED', category: 'K' },
        ],
        totalDirectCost: 5_500_000,
        totalRabCost: 5_500_000,
        totalVolume: 17,
        unpricedCount: 1,
        unpricedItems: [],
      },
      assumptions: [],
    } as unknown as DirectRabResult;
    return { ...base, ...over };
  };
  {
    const items = mapDirectRabPushItems(synth({}));
    const official = items.find((i) => i.description.includes('Resmi AHSP'));
    check('FT5-01 OFFICIAL → PRICE_RESOLVED + OFFICIAL_AHSP + VERIFIED', official !== undefined && official.priceStatus === 'PRICE_RESOLVED' && official.priceSourceKind === 'OFFICIAL_AHSP' && official.verificationStatus === 'VERIFIED');
    const bench = items.find((i) => i.description.includes('Benchmark'));
    check('FT5-02 BENCHMARK → PRICE_ESTIMATED + NEEDS_VERIFICATION + tanpa kind resmi', bench !== undefined && bench.priceStatus === 'PRICE_ESTIMATED' && bench.verificationStatus === 'NEEDS_VERIFICATION' && bench.priceSourceKind !== 'OFFICIAL_AHSP');
    const unpriced = items.find((i) => i.description.includes('Tanpa Harga'));
    check('FT5-03 tanpa harga → PRICE_UNRESOLVED + NEEDS_VERIFICATION', unpriced !== undefined && unpriced.priceStatus === 'PRICE_UNRESOLVED' && unpriced.verificationStatus === 'NEEDS_VERIFICATION');
    check('FT5-04 semua item membawa verificationStatus eksplisit', items.every((i) => i.verificationStatus === 'VERIFIED' || i.verificationStatus === 'NEEDS_VERIFICATION'));
  }
}

/* ------------------------------------------------------------------ */
/* §6. Fast Track Continuation A2 — TTL + kebasi isi pratinjau        */
/* lengkapan Full AI. Sebelum A2, pratinjau lengkapan tidak punya     */
/* batas waktu dan terima hanya memvalidasi id draft — edit interim   */
/* pada draft live sesudah proposal ditimpa diam-diam oleh klon basi. */
/* ------------------------------------------------------------------ */

async function section6(): Promise<void> {
  console.log('== §6. A2 — TTL + kebasi isi terima lengkapan ==');
  {
    // Universal: draft berubah sesudah proposal → terima ditolak,
    // pending dipertahankan; kembalikan isi draft → terima berhasil.
    resetAll();
    const draft = buildGudangDraft('800 juta');
    nullPricesWhere(draft, (it) => it.unit === 'm2');
    const beforeJson = JSON.stringify(draft);
    const stub = makeCountingStub();
    await executeBudgetFullAiRab('', MIN_CTX, { deps: stub.deps, target: 'universal' });
    check('A2U-01 pending tersedia sesudah completion', __hasPendingFullAiCompletionForTests('universal') === true);
    draft.parts[0].generation.items[0].volume += 7;
    const refused = acceptFullAiCompletion('universal');
    check('A2U-02 terima ditolak bila draft live berubah sesudah proposal', refused.ok === false && refused.message.includes('berubah'), refused.message.slice(0, 80));
    check('A2U-03 pending DIPERTAHANKAN sesudah penolakan kebasi', __hasPendingFullAiCompletionForTests('universal') === true);
    check('A2U-04 edit interim TIDAK tertimpa klon basi', JSON.stringify(getLastUniversalDraft()) !== beforeJson && getLastUniversalDraft()?.parts[0].generation.items[0].volume === JSON.parse(beforeJson).parts[0].generation.items[0].volume + 7);
    setLastUniversalDraft(JSON.parse(beforeJson) as UniversalDraft);
    const accept = acceptFullAiCompletion('universal');
    check('A2U-05 terima berhasil sesudah isi draft dikembalikan (sidik isi, bukan referensi)', accept.ok === true, accept.message.slice(0, 80));
  }
  {
    // Universal: TTL — terima sesudah 10 menit ditolak + slot dihapus.
    resetAll();
    const draft = buildGudangDraft('800 juta');
    nullPricesWhere(draft, (it) => it.unit === 'm2');
    const stub = makeCountingStub();
    await executeBudgetFullAiRab('', MIN_CTX, { deps: stub.deps, target: 'universal' });
    const expired = acceptFullAiCompletion('universal', Date.now() + DIRECT_COMMAND_CONFIRM_TTL_MS + 1);
    check('A2U-06 terima sesudah TTL ditolak (kedaluwarsa)', expired.ok === false && expired.message.includes('kedaluwarsa'), expired.message.slice(0, 80));
    check('A2U-07 pending DIHAPUS sesudah penolakan kedaluwarsa', __hasPendingFullAiCompletionForTests('universal') === false);
    check('A2U-08 terima kedua ditolak jujur (tidak ada pending)', acceptFullAiCompletion('universal').ok === false);
    void draft;
  }
  {
    // Universal: jalankan ulang completion sesudah draft berubah →
    // completion SEGAR (panggilan AI baru), bukan ajuan-ulang klon basi.
    resetAll();
    const draft = buildGudangDraft('800 juta');
    nullPricesWhere(draft, (it) => it.unit === 'm2');
    const stub = makeCountingStub();
    await executeBudgetFullAiRab('', MIN_CTX, { deps: stub.deps, target: 'universal' });
    const callsBefore = stub.calls.n;
    draft.parts[0].generation.items[0].volume += 3;
    const res = await executeBudgetFullAiRab('', MIN_CTX, { deps: stub.deps, target: 'universal' });
    check('A2U-09 completion ulang sesudah draft berubah memanggil AI lagi (pending basi dibuang)', stub.calls.n > callsBefore && res.ok === true && res.message.includes('BELUM diterapkan dan BELUM tersimpan'), `calls ${callsBefore} → ${stub.calls.n}`);
    check('A2U-10 pending baru tersedia sesudah completion segar', __hasPendingFullAiCompletionForTests('universal') === true);
  }
  {
    // Direct: hasil berubah sesudah proposal → terima ditolak;
    // kembalikan → terima berhasil; TTL → ditolak + slot dihapus.
    resetAll();
    const built = buildDirectRab('buatkan rab rumah type 36');
    check('A2D-01 buildDirectRab T36 menghasilkan hasil', built !== null);
    const direct = built!;
    const stub = makeCountingStub();
    await executeBudgetFullAiRab('buatkan rab rumah type 36 budget 120 juta', MIN_CTX, { deps: stub.deps, target: 'direct' });
    check('A2D-02 pending direct tersedia sesudah completion', __getPendingDirectCompletionForTests() !== null);
    const firstQty = (direct.generation.workItems[0] as unknown as { quantity: number }).quantity;
    (direct.generation.workItems[0] as unknown as { quantity: number }).quantity = firstQty + 5;
    const refused = acceptFullAiCompletion('direct');
    check('A2D-03 terima direct ditolak bila hasil berubah sesudah proposal', refused.ok === false && refused.message.includes('berubah'), refused.message.slice(0, 80));
    check('A2D-04 pending direct DIPERTAHANKAN sesudah penolakan kebasi', __getPendingDirectCompletionForTests() !== null);
    (direct.generation.workItems[0] as unknown as { quantity: number }).quantity = firstQty;
    const accept = acceptFullAiCompletion('direct');
    check('A2D-05 terima direct berhasil sesudah isi dikembalikan', accept.ok === true && !!direct.fullAiCompletion);

    resetAll();
    const built2 = buildDirectRab('buatkan rab rumah type 36');
    const stub2 = makeCountingStub();
    await executeBudgetFullAiRab('buatkan rab rumah type 36 budget 120 juta', MIN_CTX, { deps: stub2.deps, target: 'direct' });
    const expired = acceptFullAiCompletion('direct', Date.now() + DIRECT_COMMAND_CONFIRM_TTL_MS + 1);
    check('A2D-06 terima direct sesudah TTL ditolak (kedaluwarsa)', expired.ok === false && expired.message.includes('kedaluwarsa'), expired.message.slice(0, 80));
    check('A2D-07 pending direct DIHAPUS sesudah penolakan kedaluwarsa', __getPendingDirectCompletionForTests() === null);
    void built2;
  }
}

/* ------------------------------------------------------------------ */

async function main(): Promise<void> {
  await section1();
  section2();
  section3();
  section4();
  section5();
  await section6();
  resetAll();
  console.log(`\nfastTrackAuthz: ${passed} lulus, ${failed} gagal (total ${passed + failed})`);
  if (failures.length > 0) console.log(`Gagal: ${failures.join(' | ')}`);
  if (failed > 0) process.exitCode = 1;
}

void main();

/**
 * D5 — Tanya-balik saat draf MELEBIHI anggaran MAKSIMUM (perintah owner
 * 2026-11-26: budget adalah BATAS, bukan target).
 *
 * Perilaku yang dipin (lapisan bersama — berlaku SEMUA kategori di jalur
 * Full AI / universal, bukan hanya landscape):
 *  1. Draft OVER → pesan berisi pertanyaan balik + 3 opsi konkret
 *     (kurangi lingkup / tambah budget / ganti spek-material) dengan
 *     kontributor terbesar bernama; kalimat Push DISARING; TIDAK ADA
 *     aksi `push-universal`; `awaitBudgetDecision: true`; slot
 *     pertanyaan terisi; penanda `draft.budgetDecisionPending` terpasang.
 *  2. Selama menunggu jawaban: `validateTransfer` menolak
 *     (alasan menyebut pertanyaan budget) dan `buildPushPayload`
 *     melempar — tombol, perintah teks "transfer draft", maupun jalur
 *     aktivasi revisi tidak bisa melewatinya.
 *  3. Jawaban (b) tambah budget → cap baru diparse; bila kini UNDER,
 *     slot + penanda dibersihkan dan Push kembali; bila masih OVER,
 *     tanya-balik diperbarui dengan angka baru.
 *  4. Jawaban (a) — PERUBAHAN BENTUK D5-lanjutan 2026-11-28 (perintah
 *     owner 00:18): opsi (a) BUKAN lagi "tanya apa yang dipotong" —
 *     tombol "Terima draf sesuai budget (Tahap 1)" MENERIMA draf Tahap 1
 *     dari proposal dalam-budget: draf Tahap 1 menjadi draf aktif yang
 *     bisa ditransfer (slot + penanda bersih, Push kembali), draf
 *     lengkap tersimpan sebagai referensi sesi. Jawaban (c) tetap
 *     tanya spek pengganti. Revisi SPESIFIK sebagai pesan pertama
 *     ("kurangi penulangan jadi 50%") diteruskan ke jalur revisi
 *     normal (`continueBudgetDecision` mengembalikan null, slot
 *     dibersihkan, penanda draft TETAP sampai revisi membuat total
 *     UNDER).
 *  5. Draft UNDER / tanpa budget / tidak dapat dinilai → perilaku lama
 *     persis (Push ada, tanpa tanya-balik, tanpa slot).
 *  6. TTL 10 menit kedaluwarsa dan sidik draft berubah → slot
 *     dibersihkan dengan pesan "draft berubah, jalankan ulang".
 *
 * Yang SENGAJA TIDAK dipin di sini: jalur `acceptFullAiCompletion`
 * (lengkapan Full AI yang diterima ternyata OVER) memakai helper
 * bersama yang sama (`overBudgetAskBack`) — cakupan pengujiannya
 * mengikuti helper itu; penyiapan completion tertunda mengikuti
 * chatBudgetRabFullAi.test.ts dan tidak diulang di sini.
 *
 * Jalankan: npx --yes tsx src/test/overBudgetAskBack.test.ts
 * (skrip asersi tsx polos — BUKAN vitest; tanpa live AI.)
 */
import {
  executeIntent, universalResultFor, continueBudgetDecision, answerBudgetDecision,
  __clearPendingBudgetDecisionForTests, __getPendingBudgetDecisionForTests,
  __getFullScopeDraftBeforeCapForTests,
  DIRECT_COMMAND_CONFIRM_TTL_MS, tryContinueProjectContext, getProjectContextState,
  clearProjectContext,
} from '../ai-tools/ezrab-ai/actionRegistry';
import {
  buildUniversalDraft, computeTotals, getLastUniversalDraft, clearLastUniversalDraft,
  overBudgetDecision, topCostContributors, formatCostContributorLine,
  validateTransfer, buildPushPayload, selectWithinBudgetScope, effectiveItems,
} from '../ai-tools/ezrab-ai/universalRab';
import { extractProjectContext } from '../ai-tools/ezrab-ai/projectIntake';
import { clearLastRabIntentSpec } from '../ai-tools/ezrab-ai/rabIntentFlow';
import { parseBudgetMentions } from '../ai-tools/ezrab-ai/rabNeeds';

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; failures.push(name); console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}
const close = (a: number, b: number, tol = 1) => Math.abs(a - b) <= tol;
const mockCtx = {
  navigate: () => {},
  currentMenu: 'ezrab-ai',
  activeProject: null,
  projects: [],
  projectTotal: null,
};
const ctxFor = (rawText: string) => ({ ...mockCtx, rawText }) as never;
const hasAction = (res: { actions?: Array<{ action: { kind: string } }> }, kind: string) =>
  (res.actions ?? []).some((a) => a.action?.kind === kind);
function reset(): void {
  __clearPendingBudgetDecisionForTests();
  clearLastUniversalDraft();
  clearLastRabIntentSpec();
}
function throwsWith(fn: () => unknown, needle: string): boolean {
  try { fn(); return false; }
  catch (e) { return e instanceof Error && e.message.includes(needle); }
}

/* ------------------------------------------------------------------ */
/* 0 — Helper murni: overBudgetDecision / topCostContributors          */
/* ------------------------------------------------------------------ */
console.log('== 0 — Helper murni ==');
{
  reset();
  const res = buildUniversalDraft(
    'Saya mau buat RAB landscape, dana 50 juta, luas 1 hektar Taman publik jogging track, playground, area parkir lahan perlu dibongkar, jadi termasuk revitalisasi revisi ternyata untuk luas hanya 895 m2 (luas 895 m2)',
    'LAND-URBAN-PARK',
    { projectId: null },
  );
  check('0.1 draft landscape terbentuk', res.kind === 'draft', res.kind);
  if (res.kind === 'draft') {
    const d = res.draft;
    const dec = overBudgetDecision(d);
    check('0.2 overBudgetDecision non-null (OVER)', dec !== null);
    if (dec) {
      check('0.3 total Rp229.928.055', close(dec.total, 229928055), String(dec.total));
      check('0.4 cap Rp50.000.000', dec.cap === 50000000, String(dec.cap));
      check('0.5 selisih Rp179.928.055', close(dec.over, 179928055), String(dec.over));
      check('0.6 coverage 21,7%', Math.abs(dec.coveragePct - 21.745) < 0.05, dec.coveragePct.toFixed(2));
      check('0.7 kelipatan 4,60×', Math.abs(dec.multiple - 4.5986) < 0.01, dec.multiple.toFixed(4));
      check('0.8 provisional (2 item belum berharga)', dec.provisional === true);
      check('0.9 kontributor #1 Rp93.940.180', close(dec.contributors[0]?.amount ?? 0, 93940180), JSON.stringify(dec.contributors[0]));
      check('0.10 kontributor #2 Rp83.250.000', close(dec.contributors[1]?.amount ?? 0, 83250000), JSON.stringify(dec.contributors[1]));
      check('0.11 kontributor #3 Rp27.566.000', close(dec.contributors[2]?.amount ?? 0, 27566000), JSON.stringify(dec.contributors[2]));
      const line = formatCostContributorLine(dec.contributors[0]);
      check('0.12 baris kontributor #1', line.includes('Rp 93.940.180') && line.includes('(40,9% dari total estimasi)'), line);
      check('0.13 baris kontributor #3 (12% — tanpa ,0)', formatCostContributorLine(dec.contributors[2]).includes('Rp 27.566.000') && formatCostContributorLine(dec.contributors[2]).includes('(12% dari total estimasi)'), formatCostContributorLine(dec.contributors[2]));
    }
    check('0.14 topCostContributors urut turun', (() => {
      const top = topCostContributors(d, 3);
      return top.length === 3 && top[0].amount >= top[1].amount && top[1].amount >= top[2].amount;
    })());
  }
  const under = buildUniversalDraft('budget 400jt buatkan rab struktur retaining wall panjang 50 m');
  check('0.15 UNDER (356,9jt < 400jt) → null', under.kind === 'draft' && overBudgetDecision(under.kind === 'draft' ? under.draft : (null as never)) === null, under.kind);
  const noBudget = buildUniversalDraft('buatkan RAB retaining wall panjang 100 m tinggi 3 m');
  check('0.16 tanpa budget → null', noBudget.kind === 'draft' && overBudgetDecision(noBudget.kind === 'draft' ? noBudget.draft : (null as never)) === null, noBudget.kind);
  // D5 — parser budget menerima "jadi" (bahasa revisi yang sama dengan
  // perbaikan D1 pada pola luas): jawaban "(b) tambah budget jadi
  // 400 juta" HARUS terbaca sebagai cap baru, bukan tanya-ulang.
  check('0.17 parse "tambah budget jadi 400 juta" → 400jt',
    parseBudgetMentions('tambah budget jadi 400 juta').some((m) => m.amount === 400000000),
    JSON.stringify(parseBudgetMentions('tambah budget jadi 400 juta')));
  check('0.18 parse "budget jadi 300 juta" → 300jt',
    parseBudgetMentions('budget jadi 300 juta').some((m) => m.amount === 300000000),
    JSON.stringify(parseBudgetMentions('budget jadi 300 juta')));
}

/* ------------------------------------------------------------------ */
/* 1 — OVER retaining wall (jalur executeIntent): tanya-balik + kunci */
/* ------------------------------------------------------------------ */
console.log('== 1 — OVER retaining wall 50 m / budget 100jt ==');
{
  reset();
  const live = executeIntent('CREATE_RAB_SUMMARY', undefined, ctxFor('budget 100jt buatkan rab struktur retaining wall panjang 50 m'));
  check('1.1 live ok + awaitBudgetDecision', live.ok === true && (live as { awaitBudgetDecision?: boolean }).awaitBudgetDecision === true, `ok=${live.ok} await=${(live as { awaitBudgetDecision?: boolean }).awaitBudgetDecision}`);
  check('1.2 pesan: pertanyaan + 3 opsi', live.message.includes('perlu keputusan Anda') &&
    live.message.includes('Kurangi lingkup') && live.message.includes('Tambah budget') &&
    live.message.includes('Ganti spek/material'), live.message.slice(0, 200));
  check('1.3 pesan: BELUM final / BELUM bisa ditransfer', live.message.includes('BELUM final') && live.message.includes('BELUM bisa ditransfer'));
  check('1.4 pesan: MELEBIHI Rp256.953.225', live.message.includes('MELEBIHI anggaran sebesar Rp256.953.225'));
  check('1.5 pesan: kontributor Penulangan Dinding', live.message.includes('Penulangan Dinding BjTP ≥ 12 mm — Rp 160.036.223 (44,8% dari total estimasi)'));
  check('1.6 TANPA aksi push-universal', !hasAction(live, 'push-universal'), JSON.stringify(live.actions?.map((a) => a.action?.kind)));
  check('1.7 TANPA kalimat Push', !live.message.includes('Klik **Push ke Spreadsheet**'));
  check('1.8 3 tombol opsi saja', (live.actions ?? []).length === 3 &&
    hasAction(live, 'budget-decision-reduce-scope') && hasAction(live, 'budget-decision-raise-budget') &&
    hasAction(live, 'budget-decision-change-spec'), JSON.stringify(live.actions?.map((a) => a.action?.kind)));
  const d = getLastUniversalDraft();
  check('1.9 draft hidup + penanda terpasang', d != null && d.budgetDecisionPending === true);
  const slot = __getPendingBudgetDecisionForTests();
  check('1.10 slot pertanyaan terisi (draft sama)', slot != null && slot.draftId === d?.id, slot?.draftId);
  if (d) {
    const v = validateTransfer(d, 'proj-1');
    check('1.11 validateTransfer menolak (alasan budget)', v.allowed === false && v.reasons.some((r) => r.includes('pertanyaan budget')), v.reasons.join(' | '));
    check('1.12 buildPushPayload melempar (budget)', throwsWith(() => buildPushPayload(d), 'pertanyaan budget'));
  }

  // (b) lewat TEKS langsung: cap baru → UNDER → Push kembali.
  const ansB = continueBudgetDecision('tambah budget jadi 400 juta');
  check('1.13 (b) teks: ok + DI BAWAH anggaran', ansB != null && ansB.ok === true && ansB.message.includes('DI BAWAH anggaran'), ansB?.message);
  check('1.14 (b) teks: Push kembali', ansB != null && hasAction(ansB, 'push-universal'));
  check('1.15 (b) teks: slot bersih + penanda bersih', __getPendingBudgetDecisionForTests() === null && getLastUniversalDraft()?.budgetDecisionPending === false);
  if (getLastUniversalDraft()) {
    const v = validateTransfer(getLastUniversalDraft()!, 'proj-1');
    check('1.16 (b) teks: transfer kini diizinkan', v.allowed === true, v.reasons.join(' | '));
  }

  // (b) lewat TOMBOL (dua langkah: tanya cap dulu, lalu angka saja).
  reset();
  executeIntent('CREATE_RAB_SUMMARY', undefined, ctxFor('budget 100jt buatkan rab struktur retaining wall panjang 50 m'));
  const btnB1 = answerBudgetDecision('raise-budget');
  check('1.17 (b) tombol: ditanya anggaran baru', btnB1 != null && btnB1.ok === true && btnB1.message.includes('anggaran baru'), btnB1?.message);
  check('1.18 (b) tombol: slot MASIH menunggu', __getPendingBudgetDecisionForTests() != null && getLastUniversalDraft()?.budgetDecisionPending === true);
  const btnB2 = continueBudgetDecision('400 juta');
  check('1.19 (b) tombol + "400 juta": UNDER + Push', btnB2 != null && btnB2.ok === true && btnB2.message.includes('DI BAWAH anggaran') && hasAction(btnB2, 'push-universal'), btnB2?.message);
  check('1.20 (b) tombol: slot bersih', __getPendingBudgetDecisionForTests() === null);

  // (b) cap baru TAPI masih OVER → tanya-balik diperbarui, Push tetap tidak ada.
  reset();
  executeIntent('CREATE_RAB_SUMMARY', undefined, ctxFor('budget 100jt buatkan rab struktur retaining wall panjang 50 m'));
  const stillOver = continueBudgetDecision('tambah budget jadi 200 juta');
  check('1.21 (b) 200jt masih OVER: tanya-balik baru', stillOver != null && stillOver.ok === true &&
    stillOver.message.includes('masih MELEBIHI anggaran sebesar Rp156.953.225') &&
    stillOver.message.includes('perlu keputusan Anda'), stillOver?.message.slice(0, 300));
  check('1.22 (b) 200jt masih OVER: tanpa Push, slot tetap', stillOver != null && !hasAction(stillOver, 'push-universal') && __getPendingBudgetDecisionForTests() != null);
  if (getLastUniversalDraft()) {
    check('1.23 (b) 200jt masih OVER: transfer tetap ditolak', validateTransfer(getLastUniversalDraft()!, 'proj-1').allowed === false);
  }

  // D5-lanjutan 2026-11-28 (perintah owner 00:18) — PERUBAHAN BENTUK
  // YANG DISENGAJA: opsi (a) kini MENERIMA draf Tahap 1 sesuai budget
  // (bukan lagi "tanya apa yang dipotong"). Cek lama 1.24–1.28 yang
  // mem-pin perilaku lama ("sebut kontributor + tanya potongan; slot
  // tetap menunggu; revisi lanjutan diteruskan") diganti dengan
  // asersi perilaku baru di bawah — bukan dilemahkan: penerimaan
  // Tahap 1 dipin sampai ke transfer (payload hanya item Tahap 1)
  // dan draf lengkap dipin tetap tersimpan.
  reset();
  executeIntent('CREATE_RAB_SUMMARY', undefined, ctxFor('budget 100jt buatkan rab struktur retaining wall panjang 50 m'));
  const btnA = answerBudgetDecision('reduce-scope');
  check('1.24 (a) tombol: terima Tahap 1 — draf final + total Rp38.570.246 ≤ 100jt + Push ADA', btnA != null && btnA.ok === true &&
    btnA.message.includes('draf Tahap 1 sudah final') && btnA.message.includes('total Rp38.570.246') &&
    btnA.message.includes('DI BAWAH anggaran Rp100.000.000') && hasAction(btnA, 'push-universal'), btnA?.message.slice(0, 300));
  check('1.25 (a) tombol: slot + penanda bersih, transfer diizinkan, payload hanya 3 item Tahap 1', __getPendingBudgetDecisionForTests() === null &&
    getLastUniversalDraft()?.budgetDecisionPending === false &&
    getLastUniversalDraft() != null && close(computeTotals(getLastUniversalDraft()!).estimatedTotal, 38570246) &&
    validateTransfer(getLastUniversalDraft()!, 'proj-1').allowed === true &&
    (() => { try { return buildPushPayload(getLastUniversalDraft()!).length === 3; } catch { return false; } })(),
    getLastUniversalDraft() ? String(computeTotals(getLastUniversalDraft()!).estimatedTotal) : 'null');
  check('1.26 (a) tombol: draf lengkap tersimpan sebagai referensi sesi (total Rp356.953.225, id Tahap 1 cocok)', (() => {
    const full = __getFullScopeDraftBeforeCapForTests();
    return full != null && close(computeTotals(full.draft).estimatedTotal, 356953225) && full.cappedDraftId === getLastUniversalDraft()?.id;
  })());
  // Revisi SPESIFIK sebagai pesan pertama → diteruskan (null).
  reset();
  executeIntent('CREATE_RAB_SUMMARY', undefined, ctxFor('budget 100jt buatkan rab struktur retaining wall panjang 50 m'));
  const relA = continueBudgetDecision('kurangi penulangan jadi 50%');
  check('1.27 revisi spesifik pertama → null (diteruskan ke jalur revisi)', relA === null);
  check('1.28 revisi spesifik pertama: slot bersih, penanda TETAP (masih OVER), transfer TETAP ditolak', __getPendingBudgetDecisionForTests() === null &&
    getLastUniversalDraft()?.budgetDecisionPending === true &&
    getLastUniversalDraft() != null && validateTransfer(getLastUniversalDraft()!, 'proj-1').allowed === false);

  // (c) lewat TOMBOL → tanya spek pengganti; revisi diteruskan (null).
  reset();
  executeIntent('CREATE_RAB_SUMMARY', undefined, ctxFor('budget 100jt buatkan rab struktur retaining wall panjang 50 m'));
  const btnC = answerBudgetDecision('change-spec');
  check('1.29 (c) tombol: sebut kontributor + tanya spek pengganti', btnC != null && btnC.ok === true &&
    btnC.message.includes('Penulangan Dinding BjTP ≥ 12 mm') && btnC.message.includes('spek atau material penggantinya'), btnC?.message.slice(0, 200));
  const relC = continueBudgetDecision('ganti penulangan dengan besi polos');
  check('1.30 (c) lanjutan revisi → null', relC === null);
  check('1.31 (c) lanjutan revisi: slot bersih, penanda TETAP', __getPendingBudgetDecisionForTests() === null &&
    getLastUniversalDraft()?.budgetDecisionPending === true);

  // Jawaban tak dikenali → tanya-ulang, slot tetap.
  reset();
  executeIntent('CREATE_RAB_SUMMARY', undefined, ctxFor('budget 100jt buatkan rab struktur retaining wall panjang 50 m'));
  const unknown = continueBudgetDecision('halo, ada apa?');
  check('1.32 tak dikenali: tanya-ulang, slot tetap', unknown != null && unknown.ok === true &&
    unknown.message.includes('perlu keputusan Anda') && __getPendingBudgetDecisionForTests() != null, unknown?.message.slice(0, 120));

  // TTL kedaluwarsa → slot bersih + penanda bersih + pesan kedaluwarsa.
  reset();
  executeIntent('CREATE_RAB_SUMMARY', undefined, ctxFor('budget 100jt buatkan rab struktur retaining wall panjang 50 m'));
  const createdAt = __getPendingBudgetDecisionForTests()?.createdAt ?? 0;
  const expired = continueBudgetDecision('kurangi lingkup', createdAt + DIRECT_COMMAND_CONFIRM_TTL_MS + 1000);
  check('1.33 TTL habis: ok:false + kedaluwarsa', expired != null && expired.ok === false && expired.message.includes('kedaluwarsa'), expired?.message);
  check('1.34 TTL habis: slot + penanda bersih', __getPendingBudgetDecisionForTests() === null && getLastUniversalDraft()?.budgetDecisionPending === false);

  // Sidik draft berubah → ditolak "draft berubah, jalankan ulang".
  reset();
  executeIntent('CREATE_RAB_SUMMARY', undefined, ctxFor('budget 100jt buatkan rab struktur retaining wall panjang 50 m'));
  buildUniversalDraft('dana 300jt buatkan rab gudang 500 m2'); // draf lain jadi live (tanpa menyentuh slot)
  const mismatch = continueBudgetDecision('kurangi lingkup');
  check('1.35 sidik berubah: ok:false + draft berubah', mismatch != null && mismatch.ok === false && mismatch.message.includes('draft berubah, jalankan ulang'), mismatch?.message);
  check('1.36 sidik berubah: slot bersih', __getPendingBudgetDecisionForTests() === null);

  // Tanpa slot → null (pemanggil memproses normal).
  reset();
  check('1.37 tanpa slot: continueBudgetDecision → null', continueBudgetDecision('kurangi lingkup') === null);
  check('1.38 tanpa slot: answerBudgetDecision → null', answerBudgetDecision('reduce-scope') === null);
}

/* ------------------------------------------------------------------ */
/* 2 — UNDER: perilaku lama persis (Push ada, tanpa tanya-balik)       */
/* ------------------------------------------------------------------ */
console.log('== 2 — UNDER retaining wall 50 m / budget 400jt ==');
{
  reset();
  const live = executeIntent('CREATE_RAB_SUMMARY', undefined, ctxFor('budget 400jt buatkan rab struktur retaining wall panjang 50 m'));
  check('2.1 live ok, tanpa awaitBudgetDecision', live.ok === true && (live as { awaitBudgetDecision?: boolean }).awaitBudgetDecision !== true);
  check('2.2 pesan: DI BAWAH anggaran', live.message.includes('DI BAWAH anggaran'));
  check('2.3 pesan: tanpa pertanyaan budget', !live.message.includes('perlu keputusan Anda'));
  check('2.4 Push ADA', hasAction(live, 'push-universal'));
  check('2.5 kalimat Push ADA', live.message.includes('Klik **Push ke Spreadsheet**'));
  check('2.6 slot kosong + penanda tidak terpasang', __getPendingBudgetDecisionForTests() === null && getLastUniversalDraft()?.budgetDecisionPending !== true);
  const d = getLastUniversalDraft();
  if (d) {
    const v = validateTransfer(d, 'proj-1');
    check('2.7 transfer diizinkan', v.allowed === true, v.reasons.join(' | '));
    check('2.8 buildPushPayload tidak melempar', (() => { try { buildPushPayload(d); return true; } catch { return false; } })());
  }
}

/* ------------------------------------------------------------------ */
/* 3 — Kasus owner: taman publik 895 m² / budget 50jt (LAND-URBAN-PARK)*/
/* ------------------------------------------------------------------ */
console.log('== 3 — Owner: taman publik 895 m2 / budget 50jt ==');
{
  reset();
  const turns = [
    'Saya mau buat RAB landscape, dana 50 juta, luas 1 hektar',
    'Taman publik',
    'jogging track, playground, area parkir',
    'lahan perlu dibongkar, jadi termasuk revitalisasi',
    'revisi ternyata untuk luas hanya 895 m2',
  ];
  let ctx: ReturnType<typeof extractProjectContext> | null = null;
  for (const t of turns) ctx = extractProjectContext(t, ctx ?? undefined);
  const text = `${ctx!.combinedText} (luas 895 m2)`;
  // Jalur universalResultFor langsung dengan template paksa (seleksi
  // tanpa paksaan tie-fragile; D1 memakai buildUniversalDraft yang sama).
  const live = universalResultFor(text, 'LAND-URBAN-PARK', undefined, { projectId: null });
  check('3.1 hasil non-null + awaitBudgetDecision', live != null && (live as { awaitBudgetDecision?: boolean }).awaitBudgetDecision === true, live == null ? 'null' : `await=${(live as { awaitBudgetDecision?: boolean }).awaitBudgetDecision}`);
  if (live) {
    check('3.2 MELEBIHI Rp179.928.055', live.message.includes('MELEBIHI anggaran sebesar Rp179.928.055'));
    check('3.3 total Rp229.928.055', live.message.includes('Rp229.928.055'));
    check('3.4 coverage 21,7%', live.message.includes('21,7%'));
    check('3.5 kelipatan 4,60×', live.message.includes('4,60× anggaran'));
    check('3.6 kontributor #1 Jalur Pejalan 40,9%', live.message.includes('Rp 93.940.180 (40,9% dari total estimasi)'));
    check('3.7 kontributor #2 Pohon 36,2%', live.message.includes('Rp 83.250.000 (36,2% dari total estimasi)'));
    check('3.8 kontributor #3 Media Tanam 12%', live.message.includes('Rp 27.566.000 (12% dari total estimasi)'));
    check('3.9 SEMENTARA (total PARSIAL)', live.message.includes('SEMENTARA'));
    check('3.10 BELUM final / BELUM bisa ditransfer', live.message.includes('BELUM final') && live.message.includes('BELUM bisa ditransfer'));
    check('3.11 TANPA Push (aksi maupun kalimat)', !hasAction(live, 'push-universal') && !live.message.includes('Klik **Push ke Spreadsheet**'));
    check('3.12 3 opsi hadir', live.message.includes('Kurangi lingkup') && live.message.includes('Tambah budget') && live.message.includes('Ganti spek/material'));
    const d = getLastUniversalDraft();
    check('3.13 total draft Rp229.928.055 (D1)', d != null && close(computeTotals(d).estimatedTotal, 229928055), d ? String(computeTotals(d).estimatedTotal) : 'null');
    check('3.14 slot + penanda terpasang', __getPendingBudgetDecisionForTests() != null && d?.budgetDecisionPending === true);
    if (d) {
      check('3.15 transfer ditolak', validateTransfer(d, 'proj-1').allowed === false);
      check('3.16 buildPushPayload melempar', throwsWith(() => buildPushPayload(d), 'pertanyaan budget'));
    }
    // (b) tambah budget → UNDER → Push kembali.
    const ansB = continueBudgetDecision('tambah budget jadi 400 juta');
    check('3.17 (b) 400jt: UNDER + Push kembali', ansB != null && ansB.ok === true && ansB.message.includes('DI BAWAH anggaran') && hasAction(ansB, 'push-universal'), ansB?.message);
    check('3.18 (b) 400jt: slot + penanda bersih', __getPendingBudgetDecisionForTests() === null && getLastUniversalDraft()?.budgetDecisionPending === false);
  }
}

/* ------------------------------------------------------------------ */
/* 4 — OVER non-landscape: gudang 500 m² / dana 300jt                 */
/* ------------------------------------------------------------------ */
console.log('== 4 — OVER gudang 500 m2 / dana 300jt ==');
{
  reset();
  const live = executeIntent('CREATE_RAB_SUMMARY', undefined, ctxFor('dana 300jt buatkan rab gudang 500 m2'));
  check('4.1 ask-back muncul (awaitBudgetDecision)', (live as { awaitBudgetDecision?: boolean }).awaitBudgetDecision === true);
  check('4.2 MELEBIHI Rp372.625.000', live.message.includes('MELEBIHI anggaran sebesar Rp372.625.000'));
  check('4.3 TANPA Push', !hasAction(live, 'push-universal'));
  check('4.4 3 opsi hadir', live.message.includes('Kurangi lingkup') && live.message.includes('Tambah budget') && live.message.includes('Ganti spek/material'));
  const d = getLastUniversalDraft();
  check('4.5 slot + penanda terpasang', __getPendingBudgetDecisionForTests() != null && d?.budgetDecisionPending === true);
  if (d) {
    check('4.6 transfer ditolak', validateTransfer(d, 'proj-1').allowed === false);
    check('4.7 buildPushPayload melempar', throwsWith(() => buildPushPayload(d), 'pertanyaan budget'));
  }
}

/* ------------------------------------------------------------------ */
/* 5 — Tanpa budget: tanpa tanya-balik, Push ada                       */
/* ------------------------------------------------------------------ */
console.log('== 5 — Tanpa budget: tanpa tanya-balik ==');
{
  reset();
  const live = executeIntent('CREATE_RAB_SUMMARY', undefined, ctxFor('buatkan rab retaining wall panjang 100 m tinggi 3 m'));
  check('5.1 draft terbentuk', live.ok === true && live.message.includes('RAB'));
  check('5.2 tanpa awaitBudgetDecision', (live as { awaitBudgetDecision?: boolean }).awaitBudgetDecision !== true);
  check('5.3 tanpa pertanyaan budget', !live.message.includes('perlu keputusan Anda'));
  check('5.4 Push ADA', hasAction(live, 'push-universal'));
  check('5.5 slot kosong', __getPendingBudgetDecisionForTests() === null);
}

/* ------------------------------------------------------------------ */
/* 6 — Interaksi D5×D2: pratinjau intake OVER → konteks dibersihkan   */
/* ------------------------------------------------------------------ */
console.log('== 6 — Intake landscape OVER: konteks bersih, tanya-balik aktif ==');
{
  reset();
  clearProjectContext();
  executeIntent('CREATE_RAB_SUMMARY', undefined, ctxFor('Saya mau buat RAB landscape, dana 50 juta, luas 1 hektar'));
  tryContinueProjectContext('Taman publik');
  tryContinueProjectContext('jogging track, playground, dan area parkir');
  tryContinueProjectContext('lahan perlu dibongkar, jadi termasuk revitalisasi');
  tryContinueProjectContext('revisi ternyata untuk luas hanya 895 m2');
  tryContinueProjectContext('itu aja');
  const preview = executeIntent('RAB_PROJECT_PREVIEW', 'generate', ctxFor(''));
  check('6.1 pratinjau OVER → awaitBudgetDecision', (preview as { awaitBudgetDecision?: boolean }).awaitBudgetDecision === true);
  check('6.2 pratinjau OVER → tanpa Push', !hasAction(preview, 'push-universal'));
  check('6.3 pratinjau OVER → pertanyaan budget', preview.message.includes('perlu keputusan Anda'));
  check('6.4 konteks proyek DIBERSIHKAN (draft sudah tersusun)', getProjectContextState() == null);
  check('6.5 slot + penanda terpasang', __getPendingBudgetDecisionForTests() != null && getLastUniversalDraft()?.budgetDecisionPending === true);
  const s8 = tryContinueProjectContext('kan budget saya 50jt');
  check('6.6 giliran sesudah draft → null (tanpa tanya-ulang)', s8 === null, s8 === null ? 'null' : (s8?.message ?? '').slice(0, 120));
}

/* ------------------------------------------------------------------ */
/* 7 — D5-lanjutan 2026-11-28: kasus owner villa 2 lantai 500 m²      */
/*     mewah / budget Rp50jt → draf Rp1.319.572.020 (26,39×). Bentuk   */
/*     balasan baru: (1) draf Tahap 1 sesuai budget sebagai balasan   */
/*     UTAMA, (2) pernyataan tegas anggaran tidak cukup, (3) draf     */
/*     lengkap sebagai pembanding, (4) pilihan dengan opsi (a) =      */
/*     terima Tahap 1. Menerima (a) menjadikan Tahap 1 draf aktif     */
/*     yang bisa ditransfer; draf lengkap tetap tersimpan.            */
/* ------------------------------------------------------------------ */
console.log('== 7 — Owner: villa 2 lantai 500 m2 mewah / budget 50jt ==');
{
  reset();
  const live = executeIntent('CREATE_RAB_SUMMARY', undefined, ctxFor('Budget saya Rp50jt, buatkan RAB villa 2 lantai 500 m² full finishing mewah'));
  check('7.1 ask-back muncul (awaitBudgetDecision)', (live as { awaitBudgetDecision?: boolean }).awaitBudgetDecision === true);
  check('7.2 total penuh Rp1.319.572.020 tampil', live.message.includes('Rp1.319.572.020'));
  check('7.3 kelipatan 26,39× tampil', live.message.includes('26,39×'));
  check('7.4 URUTAN balasan: Tahap 1 dulu, lalu "anggaran tidak cukup", lalu pilihan', (() => {
    const iProposal = live.message.indexOf('Tahap 1 — sesuai budget');
    const iInsuff = live.message.indexOf('tidak cukup untuk membangun proyek ini sampai selesai');
    const iChoice = live.message.indexOf('perlu keputusan Anda');
    return iProposal >= 0 && iInsuff > iProposal && iChoice > iInsuff;
  })(), `proposal=${live.message.indexOf('Tahap 1 — sesuai budget')} insuff=${live.message.indexOf('tidak cukup untuk membangun proyek ini sampai selesai')} choice=${live.message.indexOf('perlu keputusan Anda')}`);
  check('7.5 Tahap 1: subtotal Rp 5.525.000 ≤ Rp 50.000.000 + 15 item belum teranggarkan', live.message.includes('Subtotal Tahap 1: **Rp 5.525.000**') &&
    live.message.includes('Belum teranggarkan'));
  check('7.6 TANPA Push (aksi maupun kalimat)', !hasAction(live, 'push-universal') && !live.message.includes('Klik **Push ke Spreadsheet**'));
  check('7.7 tombol pertama = "Terima draf sesuai budget (Tahap 1)" (kind lama, tanpa kind baru)', (live.actions ?? [])[0]?.label === 'Terima draf sesuai budget (Tahap 1)' &&
    hasAction(live, 'budget-decision-reduce-scope'), JSON.stringify((live.actions ?? []).map((a) => a.label)));
  const d = getLastUniversalDraft();
  check('7.8 total draft Rp1.319.572.020 (26,39×)', d != null && close(computeTotals(d).estimatedTotal, 1319572020), d ? String(computeTotals(d).estimatedTotal) : 'null');
  if (d) {
    const p = selectWithinBudgetScope(d);
    check('7.9 proposal: 1 item masuk (Rp5.525.000), 15 keluar, 0 belum berharga di dalam', p != null &&
      p.included.length === 1 && close(p.includedTotal, 5525000) && p.excluded.length === 15 &&
      p.unpricedIncludedCount === 0 && p.unpricedExcludedCount === 3, p ? JSON.stringify({ in: p.included.length, inTotal: p.includedTotal, ex: p.excluded.length, unIn: p.unpricedIncludedCount, unEx: p.unpricedExcludedCount }) : 'null');
    check('7.10 transfer ditolak selama menunggu', validateTransfer(d, 'proj-1').allowed === false);
  }
  // (a) lewat TOMBOL → Tahap 1 menjadi draf aktif yang bisa ditransfer.
  const btnA = answerBudgetDecision('reduce-scope');
  check('7.11 (a) tombol: Tahap 1 final + Push ADA', btnA != null && btnA.ok === true &&
    btnA.message.includes('draf Tahap 1 sudah final') && hasAction(btnA, 'push-universal'), btnA?.message.slice(0, 200));
  const capped = getLastUniversalDraft();
  check('7.12 (a) tombol: draf aktif kini total Rp5.525.000 (≤ 50jt), 1 item', capped != null &&
    close(computeTotals(capped).estimatedTotal, 5525000) && effectiveItems(capped).length === 1,
    capped ? `${computeTotals(capped).estimatedTotal} / ${effectiveItems(capped).length} item` : 'null');
  check('7.13 (a) tombol: slot + penanda bersih, transfer diizinkan, payload 1 item', __getPendingBudgetDecisionForTests() === null &&
    capped?.budgetDecisionPending === false && capped != null && validateTransfer(capped, 'proj-1').allowed === true &&
    (() => { try { return buildPushPayload(capped).length === 1; } catch { return false; } })());
  check('7.14 (a) tombol: draf lengkap tersimpan (Rp1.319.572.020) + 3 item belum berharga TETAP belum berharga (tanpa harga karangan)', (() => {
    const full = __getFullScopeDraftBeforeCapForTests();
    return full != null && close(computeTotals(full.draft).estimatedTotal, 1319572020) &&
      computeTotals(full.draft).unpricedCount === 3 &&
      effectiveItems(full.draft).filter((it) => it.unitPrice == null).length === 3;
  })());
  check('7.15 (a) tombol: draf Tahap 1 tanpa harga karangan (0 item belum berharga di dalam)', capped != null &&
    computeTotals(capped).unpricedCount === 0 &&
    effectiveItems(capped).every((it) => it.unitPrice != null && it.unitPrice > 0));

  // (a) lewat TEKS ("terima draf sesuai budget") → sama dengan tombol.
  reset();
  executeIntent('CREATE_RAB_SUMMARY', undefined, ctxFor('Budget saya Rp50jt, buatkan RAB villa 2 lantai 500 m² full finishing mewah'));
  const txtA = continueBudgetDecision('terima draf sesuai budget');
  check('7.16 (a) teks: terima Tahap 1 + Push ADA', txtA != null && txtA.ok === true &&
    txtA.message.includes('draf Tahap 1 sudah final') && hasAction(txtA, 'push-universal'), txtA?.message.slice(0, 200));
  check('7.17 (a) teks: draf aktif total Rp5.525.000', getLastUniversalDraft() != null &&
    close(computeTotals(getLastUniversalDraft()!).estimatedTotal, 5525000));

  // (b) cap baru TAPI masih OVER → tanya-balik diperbarui DENGAN
  // proposal Tahap 1 untuk cap baru (bukan blok pertanyaan saja).
  reset();
  executeIntent('CREATE_RAB_SUMMARY', undefined, ctxFor('budget 100jt buatkan rab struktur retaining wall panjang 50 m'));
  const stillOver = continueBudgetDecision('tambah budget jadi 200 juta');
  check('7.18 (b) 200jt masih OVER: proposal Tahap 1 untuk cap BARU tampil', stillOver != null &&
    stillOver.message.includes('Tahap 1 — sesuai budget Rp 200.000.000') &&
    stillOver.message.includes('masih MELEBIHI anggaran sebesar Rp156.953.225'), stillOver?.message.slice(0, 300));
  check('7.19 (b) 200jt masih OVER: tanpa Push, slot tetap', stillOver != null && !hasAction(stillOver, 'push-universal') && __getPendingBudgetDecisionForTests() != null);
  check('7.20 (b) 200jt masih OVER: transfer tetap ditolak', getLastUniversalDraft() != null &&
    validateTransfer(getLastUniversalDraft()!, 'proj-1').allowed === false);
}

console.log(`\nD5 overBudgetAskBack: ${passed} lulus / ${failed} gagal${failed ? ` — GAGAL: ${failures.join(', ')}` : ''}`);
if (failed > 0) process.exit(1);

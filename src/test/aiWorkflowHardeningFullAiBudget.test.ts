/**
 * EZRAB AI WORKFLOW HARDENING — Worker D (2026-11-26): BUDGET PROPAGATION
 * INTO RAB_FULL_AI (§4D, P1).
 *
 * Defect: jalur RAB_FULL_AI (c) membangun ulang teks sintetis dari
 * RabNeeds — yang tidak punya field budget — sehingga anggaran pengguna
 * (yang hidup di spek intent / parseBudgetMentions) hilang dalam
 * perjalanan intake → Full AI. Jalur (d) universal dan jalur (a) kartu
 * (sesudah koreksi anggaran) punya kehilangan yang sama.
 *
 * Perbaikan (file yang sama dengan suite ini diuji):
 *  - buildDirectRab(..., budgetIdrOverride?) + buildSpecRab(..., { budgetCap })
 *    menerima anggaran TERSTRUKTUR (nilai Rp apa adanya, tanpa
 *    pembulatan/konversi); override menang atas parse teks sintetis.
 *  - RAB_FULL_AI path (c)/(d) meneruskan specBudget dari spek intent
 *    aktif; path (a) memakai spek kartu (koreksi anggaran menang atas
 *    teks asal kartu yang basi).
 *  - buildFullAiPrompt(needs, budgetIdr?) membawa anggaran ke prompt
 *    fallback LLM; tanpa budget prompt byte-identical.
 *  - Tanpa budget: tidak ada angka yang dikarang, tidak ada verdict.
 *
 * Yang SUDAH diperbaiki sprint fix-up (Worker F) dan HANYA di-pin ulang
 * di sini sebagai regresi (bukan diimplementasi ulang): jalur DIRECT
 * (D-G1) + finalisasi "itu aja" (B-gap-2) + gema anggaran di kartu.
 *
 * Jalankan: npx --yes tsx src/test/aiWorkflowHardeningFullAiBudget.test.ts
 * (skrip asersi tsx polos — BUKAN vitest.)
 */
import { routeIntent } from '../ai-tools/ezrab-ai/intentRouter';
import { extractRabNeeds, looksLikeNeedsAnswer } from '../ai-tools/ezrab-ai/rabNeeds';
import { extractRabIntentSpec } from '../ai-tools/ezrab-ai/rabIntentSpec';
import {
  executeIntent, continueRabNeeds, continueRabFinalize,
  getLastRabNeeds, setLastRabNeeds, hasActiveRabNeeds,
  buildFullAiPrompt, continueRabChoice, getPendingRabChoice,
} from '../ai-tools/ezrab-ai/actionRegistry';
import { getLastDirectRab, buildDirectRab } from '../ai-tools/ezrab-ai/directRab';
import { buildSpecRab } from '../ai-tools/ezrab-ai/specRab';
import { clearLastRabIntentSpec, getLastRabIntentSpec, setLastRabIntentSpec } from '../ai-tools/ezrab-ai/rabIntentFlow';
import { getLastUniversalDraft } from '../ai-tools/ezrab-ai/universalRab';

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; failures.push(name); console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

const mockCtx = {
  navigate: () => {},
  currentMenu: 'ezrab-ai',
  activeProject: null,
  projects: [],
  projectTotal: null,
};
const ctxFor = (rawText: string) => ({ ...mockCtx, rawText }) as never;

function reset(): void {
  setLastRabNeeds(null);
  clearLastRabIntentSpec();
}

type Awaiting = { concept: boolean; needs: boolean };

/** Tiruan setia satu submit view.tsx untuk alur rumah (needs + finalisasi). */
function submit(msg: string, awaiting: Awaiting): { res: { message: string }; awaiting: Awaiting } {
  if (awaiting.needs && looksLikeNeedsAnswer(msg)) {
    const r = continueRabNeeds(msg, null);
    return { res: r, awaiting: { concept: false, needs: r.awaitRabNeeds === true } };
  }
  if (hasActiveRabNeeds(null)) {
    const fin = continueRabFinalize(msg, null);
    if (fin) return { res: fin, awaiting: { concept: false, needs: fin.awaitRabNeeds === true } };
    if (looksLikeNeedsAnswer(msg)) {
      const r = continueRabNeeds(msg, null);
      return { res: r, awaiting: { concept: false, needs: r.awaitRabNeeds === true } };
    }
  }
  const routed = routeIntent(msg);
  const res = executeIntent(routed.intent as never, undefined, ctxFor(msg));
  return { res, awaiting: { concept: false, needs: (res as { awaitRabNeeds?: boolean }).awaitRabNeeds === true } };
}

/** Alur ringkasan rumah standar: T1 budget + lantai, T2 luas, T3 KT. */
function houseFlow(budgetPhrase: string): Awaiting {
  reset();
  let st: Awaiting = { concept: false, needs: false };
  st = submit(`Saya mau buat rumah 2 lantai dengan anggaran ${budgetPhrase}.`, st).awaiting;
  st = submit('Luas bangunan 120 m2.', st).awaiting;
  st = submit('3 kamar tidur.', st).awaiting;
  return st;
}

/** Klik "Full AI" sesudah alur ringkasan: param = prompt yang dibangun
 *  tombol jalur (pathCardResult / RAB_PATH_TEMPLATE) dari needs + spek. */
function fullAiAfterSummary(): { message: string; fullAiPrompt?: string } {
  const needs = getLastRabNeeds(null)!;
  const prompt = buildFullAiPrompt(needs, getLastRabIntentSpec()?.budgetIdr ?? null);
  return executeIntent('RAB_FULL_AI', prompt, ctxFor('') as never) as { message: string; fullAiPrompt?: string };
}

/* ------------------------------------------------------------------ */
/* 1 — Anggaran awal selamat sampai handoff Full AI (path-c rumah)     */
/* ------------------------------------------------------------------ */
console.log('== 1 — Budget awal selamat ke Full AI (path-c) ==');
{
  houseFlow('300 juta');
  check('1.1 spek intent membawa budget 300.000.000', getLastRabIntentSpec()?.budgetIdr === 300_000_000,
    `dapat ${getLastRabIntentSpec()?.budgetIdr}`);
  const needs = getLastRabNeeds(null)!;
  const prompt = buildFullAiPrompt(needs, getLastRabIntentSpec()?.budgetIdr ?? null);
  check('1.2 prompt Full AI memuat anggaran Rp 300.000.000', prompt.includes('anggaran Rp 300.000.000'), prompt);
  check('1.3 prompt tetap terdeteksi sebagai prompt built (bukan teks mentah)',
    prompt.startsWith('Buatkan RAB ') && prompt.includes('Susun daftar pekerjaan lengkap'));
  const res = fullAiAfterSummary();
  const d = getLastDirectRab();
  check('1.4 Full AI terkomposisi deterministik (tabel, bukan fallback LLM)',
    res.message.includes('| No | Uraian |') && res.fullAiPrompt == null);
  check('1.5 draft path-c budgetIdr 300.000.000 (teks sintetis tidak menelan budget)',
    d?.budgetIdr === 300_000_000, `dapat ${d?.budgetIdr}`);
  check('1.6 total path-c TIDAK berubah: Rp186.183.407', d?.calc.totalDirectCost === 186183407,
    `dapat ${d?.calc.totalDirectCost}`);
  check('1.7 verdict membandingkan total vs anggaran',
    res.message.includes('total estimasi Rp186.183.407 vs anggaran Rp300.000.000'),
    res.message.split('\n').filter((l) => l.includes('Penilaian kelayakan')).join(' | '));
  check('1.8 verdict DI BAWAH + selisih Rp113.816.593',
    res.message.includes('DI BAWAH anggaran sebesar Rp113.816.593'));
}

/* ------------------------------------------------------------------ */
/* 2 — Anggaran selamat dari rekonstruksi teks sintetis (builder)      */
/* ------------------------------------------------------------------ */
console.log('== 2 — Budget selamat dari rekonstruksi sintetis (builder) ==');
{
  const synthetic = 'buatkan rab rumah luas bangunan 120 m2 2 lantai';
  const specBuilt = buildSpecRab(synthetic, { budgetCap: 300_000_000 });
  check('2.1 buildSpecRab(sintetis, budgetCap) budgetIdr 300.000.000',
    specBuilt?.budgetIdr === 300_000_000, `dapat ${specBuilt?.budgetIdr}`);
  check('2.2 buildSpecRab(sintetis, budgetCap) total tetap Rp186.183.407',
    specBuilt?.calc.totalDirectCost === 186183407, `dapat ${specBuilt?.calc.totalDirectCost}`);
  // buildDirectRab HANYA cocok untuk teks template terdaftar ("type 70");
  // teks "luas bangunan 120 m2 2 lantai" tanpa tipe TIDAK cocok dan
  // mengembalikan null (jalur spek yang mengambilnya — lihat §1/§2.1).
  const direct = 'buatkan rab rumah type 70 2 lantai';
  const over = buildDirectRab(direct, undefined, 300_000_000);
  check('2.3 buildDirectRab(teks, override 300jt) budgetIdr 300.000.000',
    over?.budgetIdr === 300_000_000, `dapat ${over?.budgetIdr}`);
  check('2.4 override TIDAK mengubah total (sama dengan tanpa override)',
    over?.calc.totalDirectCost === buildDirectRab(direct)?.calc.totalDirectCost &&
    over?.calc.totalDirectCost === 208541930, `dapat ${over?.calc.totalDirectCost}`);
  const stale = buildDirectRab(`${direct} budget 500jt`, undefined, 300_000_000);
  check('2.5 terstruktur menang atas teks basi: override 300jt > "budget 500jt" di teks',
    stale?.budgetIdr === 300_000_000, `dapat ${stale?.budgetIdr}`);
  const parsed = buildDirectRab(`${direct} budget 500jt`);
  check('2.6 tanpa override: parse teks tetap jalan (500jt)',
    parsed?.budgetIdr === 500_000_000, `dapat ${parsed?.budgetIdr}`);
  const none = buildSpecRab(synthetic);
  check('2.7 tanpa budget di mana pun: budgetIdr null (tidak dikarang)',
    none?.budgetIdr == null, `dapat ${none?.budgetIdr}`);
  const exact = buildDirectRab(direct, undefined, 123_456_789);
  check('2.8 nilai override diteruskan PERSIS tanpa pembulatan (123.456.789)',
    exact?.budgetIdr === 123_456_789, `dapat ${exact?.budgetIdr}`);
}

/* ------------------------------------------------------------------ */
/* 3 — Anggaran selamat melewati giliran klarifikasi                   */
/* ------------------------------------------------------------------ */
console.log('== 3 — Budget selamat melewati klarifikasi ==');
{
  reset();
  let st: Awaiting = { concept: false, needs: false };
  st = submit('Saya mau buat rumah 2 lantai dengan anggaran 300 juta.', st).awaiting;
  check('3.1 T1: spek budget 300.000.000', getLastRabIntentSpec()?.budgetIdr === 300_000_000);
  st = submit('Luas bangunan 120 m2.', st).awaiting;
  check('3.2 T2 (klarifikasi tanpa budget): spek budget TETAP 300.000.000',
    getLastRabIntentSpec()?.budgetIdr === 300_000_000, `dapat ${getLastRabIntentSpec()?.budgetIdr}`);
  st = submit('3 kamar tidur.', st).awaiting;
  check('3.3 T3 (klarifikasi tanpa budget): spek budget TETAP 300.000.000',
    getLastRabIntentSpec()?.budgetIdr === 300_000_000, `dapat ${getLastRabIntentSpec()?.budgetIdr}`);
  // Koreksi anggaran lewat continueRabNeeds langsung: looksLikeNeedsAnswer
  // (rabNeeds.ts, file Worker A) TIDAK mengenali frasa budget telanjang
  // ("anggaran 250 juta" → false) sehingga imitasi submit() tidak
  // merutekannya ke sini — lapisan merge-nya sendiri yang diuji di sini.
  continueRabNeeds('anggaran 250 juta', null);
  check('3.4 koreksi "anggaran 250 juta": spek budget menjadi 250.000.000',
    getLastRabIntentSpec()?.budgetIdr === 250_000_000, `dapat ${getLastRabIntentSpec()?.budgetIdr}`);
  check('3.5 koreksi budget tidak merusak needs lain (luas 120, lantai 2)',
    getLastRabNeeds(null)?.buildingArea === 120 && getLastRabNeeds(null)?.floors === 2);
  const res = fullAiAfterSummary();
  check('3.6 Full AI sesudah koreksi: verdict vs anggaran TERKOREKSI Rp250.000.000',
    res.message.includes('total estimasi Rp186.183.407 vs anggaran Rp250.000.000'),
    res.message.split('\n').filter((l) => l.includes('Penilaian kelayakan')).join(' | '));
  check('3.7 Full AI sesudah koreksi: DI BAWAH sebesar Rp63.816.593',
    res.message.includes('DI BAWAH anggaran sebesar Rp63.816.593'));
}

/* ------------------------------------------------------------------ */
/* 4 — Anggaran selamat sampai finalisasi "itu aja" (pin regresi)      */
/* ------------------------------------------------------------------ */
console.log('== 4 — Budget selamat sampai finalisasi (pin regresi fix-up) ==');
{
  houseFlow('300 juta');
  const fin = submit('itu aja', { concept: false, needs: true });
  const d = getLastDirectRab();
  check('4.1 finalisasi: draft RAB rumah disusun', fin.res.message.includes('Draft RAB rumah tinggal'));
  check('4.2 finalisasi: draft budgetIdr 300.000.000', d?.budgetIdr === 300_000_000, `dapat ${d?.budgetIdr}`);
  check('4.3 finalisasi: total Rp187.133.407 (3 KT eksplisit, tidak berubah)',
    d?.calc.totalDirectCost === 187133407, `dapat ${d?.calc.totalDirectCost}`);
  check('4.4 finalisasi: verdict DI BAWAH + selisih Rp112.866.593',
    fin.res.message.includes('DI BAWAH anggaran sebesar Rp112.866.593'));
}

/* ------------------------------------------------------------------ */
/* 5 — Anggaran selamat di alur kartu pilihan (path-a)                 */
/* ------------------------------------------------------------------ */
console.log('== 5 — Budget selamat di alur kartu pilihan (path-a) ==');
{
  reset();
  const card = executeIntent('CREATE_RAB_DIRECT', undefined, ctxFor('buatkan rab rumah luas bangunan 86 m2 budget 300jt'));
  check('5.1 kartu pilihan tampil (awaitRabChoice)', (card as { awaitRabChoice?: boolean }).awaitRabChoice === true);
  check('5.2 kartu menggema anggaran Rp 300.000.000', card.message.includes('Anggaran: Rp 300.000.000'));
  const fullAi = (card.actions ?? []).find((a) => a.label === 'Pakai AI Full');
  check('5.3 tombol "Pakai AI Full" memakai teks asal kartu',
    (fullAi?.action as { param?: string } | undefined)?.param === 'buatkan rab rumah luas bangunan 86 m2 budget 300jt');
  const res = executeIntent('RAB_FULL_AI', (fullAi?.action as { param?: string } | undefined)?.param, ctxFor('') as never);
  const d = getLastDirectRab();
  check('5.4 Full AI dari kartu: draft budgetIdr 300.000.000', d?.budgetIdr === 300_000_000, `dapat ${d?.budgetIdr}`);
  check('5.5 Full AI dari kartu: total Rp207.614.146 (tidak berubah)',
    d?.calc.totalDirectCost === 207614146, `dapat ${d?.calc.totalDirectCost}`);
  check('5.6 Full AI dari kartu: verdict DI BAWAH sebesar Rp92.385.854',
    res.message.includes('DI BAWAH anggaran sebesar Rp92.385.854'),
    res.message.split('\n').filter((l) => l.includes('Penilaian kelayakan')).join(' | '));
}
console.log('== 5b — Koreksi anggaran di kartu menang atas teks asal ==');
{
  reset();
  const card = executeIntent('CREATE_RAB_DIRECT', undefined, ctxFor('buatkan rab rumah luas bangunan 86 m2 budget 300jt'));
  const corr = continueRabChoice('anggaran 250 juta', null);
  check('5.7 kartu terkoreksi menggema anggaran Rp 250.000.000',
    corr.message.includes('Anggaran: Rp 250.000.000'));
  check('5.8 spek kartu terkoreksi 250.000.000', getPendingRabChoice()?.spec?.budgetIdr === 250_000_000,
    `dapat ${getPendingRabChoice()?.spec?.budgetIdr}`);
  const fullAi = (corr.actions ?? []).find((a) => a.label === 'Pakai AI Full');
  const res = executeIntent('RAB_FULL_AI', (fullAi?.action as { param?: string } | undefined)?.param, ctxFor('') as never);
  const d = getLastDirectRab();
  check('5.9 Full AI dari kartu terkoreksi: draft budgetIdr 250.000.000 (BUKAN 300jt basi dari teks asal)',
    d?.budgetIdr === 250_000_000, `dapat ${d?.budgetIdr}`);
  check('5.10 Full AI dari kartu terkoreksi: verdict vs Rp250.000.000, DI BAWAH Rp42.385.854',
    res.message.includes('total estimasi Rp207.614.146 vs anggaran Rp250.000.000') &&
    res.message.includes('DI BAWAH anggaran sebesar Rp42.385.854'),
    res.message.split('\n').filter((l) => l.includes('Penilaian kelayakan')).join(' | '));
}

/* ------------------------------------------------------------------ */
/* 6 — Verdict kelayakan Full AI benar (UNDER + OVER)                  */
/* ------------------------------------------------------------------ */
console.log('== 6 — Verdict Full AI benar (OVER) ==');
{
  houseFlow('100 juta');
  check('6.1 spek budget 100.000.000', getLastRabIntentSpec()?.budgetIdr === 100_000_000,
    `dapat ${getLastRabIntentSpec()?.budgetIdr}`);
  const res = fullAiAfterSummary();
  check('6.2 OVER: total estimasi Rp186.183.407 vs anggaran Rp100.000.000',
    res.message.includes('total estimasi Rp186.183.407 vs anggaran Rp100.000.000'));
  check('6.3 OVER: MELEBIHI anggaran sebesar Rp86.183.407',
    res.message.includes('MELEBIHI anggaran sebesar Rp86.183.407'),
    res.message.split('\n').filter((l) => l.includes('Penilaian kelayakan')).join(' | '));
  check('6.4 OVER: estimasi biaya TIDAK dipangkas ke budget (total tetap tampil)',
    res.message.includes('Rp186.183.407'));
}

/* ------------------------------------------------------------------ */
/* 7 — Harga hilang tidak melahirkan keyakinan budget palsu            */
/* ------------------------------------------------------------------ */
console.log('== 7 — Harga hilang ≠ keyakinan budget palsu ==');
{
  houseFlow('300 juta');
  const res = fullAiAfterSummary();
  check('7.1 draft PARSIAL (24/25 berharga) + budget → verdict SEMENTARA',
    res.message.includes('PARSIAL') && res.message.includes('SEMENTARA — total PARSIAL, ada item belum berharga'),
    res.message.split('\n').filter((l) => l.includes('Penilaian kelayakan')).join(' | '));
}
console.log('== 7b — Tanpa budget: tidak ada verdict karangan ==');
{
  reset();
  let st: Awaiting = { concept: false, needs: false };
  st = submit('Saya mau buat rumah 2 lantai.', st).awaiting;
  st = submit('Luas bangunan 120 m2.', st).awaiting;
  check('7.2 tanpa budget: spek budgetIdr null', getLastRabIntentSpec()?.budgetIdr == null,
    `dapat ${getLastRabIntentSpec()?.budgetIdr}`);
  const prompt = buildFullAiPrompt(getLastRabNeeds(null)!);
  check('7.3 tanpa budget: prompt Full AI TANPA frasa anggaran (byte-identical)',
    !prompt.includes('anggaran'));
  const res = executeIntent('RAB_FULL_AI', prompt, ctxFor('') as never);
  const d = getLastDirectRab();
  check('7.4 tanpa budget: draft tetap disusun, budgetIdr null',
    res.message.includes('| No | Uraian |') && d?.budgetIdr == null, `dapat ${d?.budgetIdr}`);
  check('7.5 tanpa budget: TIDAK ADA baris verdict / DI BAWAH / MELEBIHI',
    !res.message.includes('Penilaian kelayakan budget') &&
    !res.message.includes('DI BAWAH') && !res.message.includes('MELEBIHI'));
}
console.log('== 7c — Universal path-(d): jujur soal budget ==');
{
  reset();
  const needs = extractRabNeeds('buatkan rab gudang 10 x 20 m');
  setLastRabNeeds(needs, null);
  setLastRabIntentSpec(extractRabIntentSpec('buatkan rab gudang 10 x 20 m budget 120jt'));
  check('7.6 universal: spek budget 120.000.000', getLastRabIntentSpec()?.budgetIdr === 120_000_000);
  const res = executeIntent('RAB_FULL_AI', buildFullAiPrompt(needs, getLastRabIntentSpec()?.budgetIdr ?? null), ctxFor('') as never);
  const draft = getLastUniversalDraft();
  check('7.7 universal path-(d): draft tersusun dari teks sintetis', draft != null && res.message.includes('Gudang'));
  check('7.8 universal path-(d): draft membawa cap 120.000.000',
    (draft as unknown as { spec?: { budgetCap?: number | null } } | null)?.spec?.budgetCap === 120_000_000,
    `dapat ${(draft as unknown as { spec?: { budgetCap?: number | null } } | null)?.spec?.budgetCap}`);
  check('7.9 universal path-(d): Anggaran Rp 120.000.000 + MELEBIHI Rp149.050.000',
    res.message.includes('Anggaran: Rp 120.000.000') && res.message.includes('MELEBIHI anggaran sebesar Rp149.050.000'),
    res.message.split('\n').filter((l) => /Anggaran|kelayakan/.test(l)).join(' | '));
  reset();
  const needsNoBudget = extractRabNeeds('buatkan rab gudang 10 x 20 m');
  setLastRabNeeds(needsNoBudget, null);
  setLastRabIntentSpec(extractRabIntentSpec('buatkan rab gudang 10 x 20 m'));
  const resNo = executeIntent('RAB_FULL_AI', buildFullAiPrompt(needsNoBudget), ctxFor('') as never);
  check('7.10 universal tanpa budget: jujur "Budget belum disebutkan", tanpa angka karangan',
    resNo.message.includes('Budget belum disebutkan') && !resNo.message.includes('Rp120.000.000'));
}

/* ------------------------------------------------------------------ */
/* 8 — Total kanonis tidak berubah                                     */
/* ------------------------------------------------------------------ */
console.log('== 8 — Total kanonis tidak berubah ==');
{
  check('8.1 DIRECT template total Rp208.541.930 dengan ATAU tanpa override budget',
    buildDirectRab('buatkan rab rumah type 70 2 lantai')?.calc.totalDirectCost === 208541930 &&
    buildDirectRab('buatkan rab rumah type 70 2 lantai', undefined, 300_000_000)?.calc.totalDirectCost === 208541930);
  check('8.2 SPEC total Rp186.183.407 dengan ATAU tanpa budgetCap',
    buildSpecRab('buatkan rab rumah 2 lantai luas bangunan 120 m2')?.calc.totalDirectCost === 186183407 &&
    buildSpecRab('buatkan rab rumah 2 lantai luas bangunan 120 m2', { budgetCap: 300_000_000 })?.calc.totalDirectCost === 186183407);
  houseFlow('300 juta');
  const res = fullAiAfterSummary();
  check('8.3 path-(c) total Rp186.183.407 (pin §1 — engine otoritatif)',
    getLastDirectRab()?.calc.totalDirectCost === 186183407 &&
    res.message.includes('Rp186.183.407'));
  const fin = submit('itu aja', { concept: false, needs: true });
  check('8.4 finalisasi total Rp187.133.407 (pin §4 — engine otoritatif)',
    getLastDirectRab()?.calc.totalDirectCost === 187133407 &&
    fin.res.message.includes('Rp187.133.407'));
}

console.log(`\n${failed === 0 ? 'SEMUA TES HARDENING FULL-AI BUDGET LULUS' : 'ADA TES GAGAL'} — lulus ${passed}, gagal ${failed}`);
if (failures.length) console.log('Gagal:', failures.join(' | '));
process.exit(failed === 0 ? 0 : 1);

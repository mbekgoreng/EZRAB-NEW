/**
 * EZRAB AI & WORKFLOW COMPLETION SPRINT — Worker F fix-up (2026-11-26).
 *
 * Menutup dua celah dari proposed-patch Worker B / Worker D:
 *  1. B-gap-1 — koreksi "bukan 2 lantai, 3 lantai" → lantai 3 (bukan 1
 *     di needs, bukan 2 di spek). Perbaikan: parseFloorsMention
 *     (rabNeeds.ts) mem-blanko frasa yang dinegasikan lalu parsing
 *     berlanjut; ekstraksi lantai spek (rabIntentSpec.ts) melewati
 *     kemunculan yang dinegasikan dan mengambil kandidat sah TERAKHIR.
 *     Murni negasi tanpa pengganti kini UNKNOWN (null) di kedua lapisan
 *     — keputusan owner FINAL 2026-11-26 (Worker F hardening), yang
 *     MEMBALIKKAN fallback sprint "murni negasi → 1".
 *  2. B-gap-2 + D-G1 — draft rumah (jalur DIRECT template/spek DAN
 *     jalur finalisasi "itu aja") kini memuat verdict kelayakan
 *     anggaran yang sama dengan draft universal: total biaya langsung
 *     vs anggaran, UNDER/OVER + selisih Rp. Total draft TIDAK berubah
 *     — hanya perbandingan yang dirender. Tanpa budget, pesan
 *     byte-identical (tanpa baris verdict).
 *
 * Jalankan: npx --yes tsx src/test/aiWorkflowSprintFixup.test.ts
 * (skrip asersi tsx polos — BUKAN vitest.)
 */
import { routeIntent } from '../ai-tools/ezrab-ai/intentRouter';
import { parseFloorsMention, extractRabNeeds, looksLikeNeedsAnswer } from '../ai-tools/ezrab-ai/rabNeeds';
import { extractRabIntentSpec } from '../ai-tools/ezrab-ai/rabIntentSpec';
import {
  executeIntent, continueRabNeeds, continueRabFinalize,
  getLastRabNeeds, setLastRabNeeds, hasActiveRabNeeds,
} from '../ai-tools/ezrab-ai/actionRegistry';
import { getLastDirectRab } from '../ai-tools/ezrab-ai/directRab';
import { clearLastRabIntentSpec, getLastRabIntentSpec } from '../ai-tools/ezrab-ai/rabIntentFlow';

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
const hasAction = (res: { actions?: Array<{ action: { kind: string } }> }, kind: string) =>
  (res.actions ?? []).some((a) => a.action.kind === kind);

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

/* ------------------------------------------------------------------ */
/* 1 — Koreksi lantai: parser (needs + spek)                           */
/* ------------------------------------------------------------------ */
console.log('== 1 — Koreksi lantai: "bukan 2 lantai, 3 lantai" ==');
{
  check('1.1 needs "bukan 2 lantai, 3 lantai" → 3', parseFloorsMention('bukan 2 lantai, 3 lantai') === 3,
    `dapat ${parseFloorsMention('bukan 2 lantai, 3 lantai')}`);
  check('1.2 spek "bukan 2 lantai, 3 lantai" → 3', extractRabIntentSpec('bukan 2 lantai, 3 lantai').floors === 3,
    `dapat ${extractRabIntentSpec('bukan 2 lantai, 3 lantai').floors}`);
  check('1.3 needs "3 lantai" → 3', parseFloorsMention('3 lantai') === 3);
  check('1.4 spek "3 lantai" → 3', extractRabIntentSpec('3 lantai').floors === 3);
  check('1.5 needs "2 lantai" → 2', parseFloorsMention('2 lantai') === 2);
  check('1.6 spek "2 lantai" → 2', extractRabIntentSpec('2 lantai').floors === 2);
  check('1.7 needs "bukan 2 lantai" → null (UNKNOWN — keputusan owner 2026-11-26, bukan 1)', parseFloorsMention('bukan 2 lantai') === null,
    `dapat ${parseFloorsMention('bukan 2 lantai')}`);
  check('1.8 spek "bukan 2 lantai" → null (UNKNOWN — keputusan owner 2026-11-26, bukan 1)', extractRabIntentSpec('bukan 2 lantai').floors === null,
    `dapat ${extractRabIntentSpec('bukan 2 lantai').floors}`);
  check('1.9 needs "jangan dua lantai" → null (UNKNOWN — keputusan owner 2026-11-26, pin lama → 1 dicabut)', parseFloorsMention('jangan dua lantai') === null);
  check('1.10 needs "tidak bertingkat" → null (UNKNOWN — keputusan owner 2026-11-26, pin lama → 1 dicabut)', parseFloorsMention('tidak bertingkat') === null);
  check('1.11 spek "jangan dua lantai" → null (UNKNOWN — keputusan owner 2026-11-26)', extractRabIntentSpec('jangan dua lantai').floors === null);
  check('1.12 needs "bukan bertingkat, 3 lantai" → 3', parseFloorsMention('bukan bertingkat, 3 lantai') === 3,
    `dapat ${parseFloorsMention('bukan bertingkat, 3 lantai')}`);
  check('1.13 needs "2 lantai" → "lantai 3" tetap 3 (pin koreksi lama)',
    parseFloorsMention('Saya mau buat rumah 2 lantai. Koreksi: lantai 3') === 3);
  check('1.14 needs "rumah tidak bertingkat 6x10" → null (UNKNOWN — keputusan owner 2026-11-26, pin p0 → 1 dicabut)',
    parseFloorsMention('buatkan rab rumah tidak bertingkat 6x10') === null);
  check('1.15 needs "bukan dua lantai, tiga lantai" → 3 (kata bilangan)',
    parseFloorsMention('bukan dua lantai, tiga lantai') === 3);
  check('1.16 spek "bukan dua lantai, tiga lantai" → 3',
    extractRabIntentSpec('bukan dua lantai, tiga lantai').floors === 3);
  check('1.17 spek "bukan 2 lantai, lantai 3" → 3 (bentuk lantai-N)',
    extractRabIntentSpec('bukan 2 lantai, lantai 3').floors === 3);
  check('1.18 extractRabNeeds "bukan 2 lantai, 3 lantai" → floors 3',
    extractRabNeeds('bukan 2 lantai, 3 lantai').floors === 3,
    `dapat ${extractRabNeeds('bukan 2 lantai, 3 lantai').floors}`);
}

/* ------------------------------------------------------------------ */
/* 2 — Koreksi lantai: multi-giliran (alur Worker B §4)                */
/* ------------------------------------------------------------------ */
console.log('== 2 — Koreksi multi-giliran: "bukan 2 lantai, 3 lantai" ==');
{
  reset();
  let st: Awaiting = { concept: false, needs: false };
  st = submit('Saya mau buat rumah 2 lantai dengan anggaran 300 juta.', st).awaiting;
  st = submit('Luas bangunan 120 m2.', st).awaiting;
  st = submit('3 kamar tidur.', st).awaiting;
  submit('bukan 2 lantai, 3 lantai', st);
  check('2.1 koreksi negasi → needs lantai 3', getLastRabNeeds(null)?.floors === 3,
    `dapat ${getLastRabNeeds(null)?.floors}`);
  check('2.2 koreksi negasi → spek lantai 3', getLastRabIntentSpec()?.floors === 3,
    `dapat ${getLastRabIntentSpec()?.floors}`);
  check('2.3 koreksi negasi: luas 120 + 3 KT bertahan',
    getLastRabNeeds(null)?.buildingArea === 120 && getLastRabNeeds(null)?.bedrooms === 3);
}

/* ------------------------------------------------------------------ */
/* 3 — Draft rumah DIRECT memuat verdict anggaran (D-G1)                */
/* ------------------------------------------------------------------ */
console.log('== 3 — DIRECT: "rumah 2 lantai luas 120 m2 budget 500jt" ==');
{
  reset();
  const res = executeIntent('CREATE_RAB_DIRECT', undefined, ctxFor('buatkan rab rumah 2 lantai luas bangunan 120 m2 budget 500jt'));
  const d = getLastDirectRab();
  check('3.1 handler berhasil + tombol push-rab', res.ok === true && hasAction(res, 'push-rab'));
  check('3.2 draft budgetIdr 500.000.000', d?.budgetIdr === 500_000_000, `dapat ${d?.budgetIdr}`);
  check('3.3 total TIDAK berubah: Rp186.183.407', d?.calc.totalDirectCost === 186183407,
    `dapat ${d?.calc.totalDirectCost}`);
  check('3.4 verdict DI BAWAH + selisih Rp313.816.593',
    res.message.includes('DI BAWAH anggaran sebesar Rp313.816.593'), res.message.split('\n').filter((l) => l.includes('Penilaian kelayakan')).join(' | '));
  check('3.5 verdict membandingkan total vs anggaran',
    res.message.includes('total estimasi Rp186.183.407 vs anggaran Rp500.000.000'));
  check('3.6 baris "Penilaian kelayakan budget" tampil', res.message.includes('Penilaian kelayakan budget'));
}
console.log('== 3b — DIRECT tanpa budget: pesan tanpa verdict ==');
{
  reset();
  const res = executeIntent('CREATE_RAB_DIRECT', undefined, ctxFor('buatkan rab rumah 2 lantai luas bangunan 120 m2'));
  const d = getLastDirectRab();
  check('3.7 tanpa budget: budgetIdr null', d?.budgetIdr == null, `dapat ${d?.budgetIdr}`);
  check('3.8 tanpa budget: tanpa baris verdict (byte-identical)', !res.message.includes('Penilaian kelayakan budget'));
  check('3.9 tanpa budget: total tetap tampil', res.message.includes('Total RAB'));
}
console.log('== 3c — DIRECT jalur template: type 70 2 lantai budget 300jt ==');
{
  reset();
  const res = executeIntent('CREATE_RAB_DIRECT', undefined, ctxFor('buatkan rab rumah type 70 2 lantai budget 300jt'));
  const d = getLastDirectRab();
  check('3.10 template: draft terbentuk (sourceKind template)', d?.sourceKind === 'template', `dapat ${d?.sourceKind}`);
  check('3.11 template: budgetIdr 300.000.000', d?.budgetIdr === 300_000_000, `dapat ${d?.budgetIdr}`);
  check('3.12 template: total Rp208.541.930 (tidak berubah)', d?.calc.totalDirectCost === 208541930,
    `dapat ${d?.calc.totalDirectCost}`);
  check('3.13 template: verdict DI BAWAH + selisih Rp91.458.070',
    res.message.includes('DI BAWAH anggaran sebesar Rp91.458.070'));
}
console.log('== 3d — Kartu pilihan menggema anggaran (D-G1) ==');
{
  reset();
  const res = executeIntent('CREATE_RAB_DIRECT', undefined, ctxFor('buatkan rab rumah luas bangunan 86 m2 budget 300jt'));
  check('3.14 kartu pilihan tampil (awaitRabChoice)', (res as { awaitRabChoice?: boolean }).awaitRabChoice === true);
  check('3.15 kartu: anggaran Rp 300.000.000 digema', res.message.includes('Anggaran: Rp 300.000.000'),
    res.message.slice(0, 400));
}

/* ------------------------------------------------------------------ */
/* 4 — Finalisasi "itu aja" memuat verdict anggaran (B-gap-2)          */
/* ------------------------------------------------------------------ */
console.log('== 4 — Finalisasi: rumah 2 lantai + 300jt → "itu aja" ==');
{
  reset();
  let st: Awaiting = { concept: false, needs: false };
  const t1 = submit('Saya mau buat rumah 2 lantai dengan anggaran 300 juta.', st);
  st = t1.awaiting;
  check('4.1 T1: ringkasan rumah tampil', t1.res.message.includes('rumah tinggal'));
  const t2 = submit('Luas bangunan 120 m2.', st);
  st = t2.awaiting;
  check('4.2 T2: luas 120 tersimpan', getLastRabNeeds(null)?.buildingArea === 120);
  const t3 = submit('3 kamar tidur.', st);
  st = t3.awaiting;
  check('4.3 T3: kamar tidur 3 tersimpan', getLastRabNeeds(null)?.bedrooms === 3);
  const fin = submit('itu aja', st);
  const d = getLastDirectRab();
  check('4.4 finalisasi: draft RAB rumah disusun', fin.res.message.includes('Draft RAB rumah tinggal'));
  check('4.5 finalisasi: draft budgetIdr 300.000.000', d?.budgetIdr === 300_000_000, `dapat ${d?.budgetIdr}`);
  // Total 3 KT eksplisit (Rp187.133.407) BUKAN total default 2 KT
  // (Rp186.183.407, pin Worker D §6 — teks DIRECT tanpa sebutan KT):
  // bedroomCount adalah parameter engine, kamar ke-3 menambah
  // Rp950.000. Verdict memakai total draft YANG SAMA (bukan total lain).
  check('4.6 finalisasi: total Rp187.133.407 (3 KT eksplisit)', d?.calc.totalDirectCost === 187133407,
    `dapat ${d?.calc.totalDirectCost}`);
  check('4.7 finalisasi: verdict DI BAWAH + selisih Rp112.866.593',
    fin.res.message.includes('DI BAWAH anggaran sebesar Rp112.866.593'),
    fin.res.message.split('\n').filter((l) => l.includes('Penilaian kelayakan')).join(' | '));
  check('4.8 finalisasi: verdict membandingkan total vs anggaran',
    fin.res.message.includes('total estimasi Rp187.133.407 vs anggaran Rp300.000.000'));
}
console.log('== 4b — Finalisasi tanpa budget: tanpa verdict ==');
{
  reset();
  let st: Awaiting = { concept: false, needs: false };
  st = submit('Saya mau buat rumah 2 lantai.', st).awaiting;
  st = submit('Luas bangunan 120 m2.', st).awaiting;
  st = submit('3 kamar tidur.', st).awaiting;
  const fin = submit('itu aja', st);
  const d = getLastDirectRab();
  check('4.9 tanpa budget: draft tetap disusun', fin.res.message.includes('Draft RAB rumah tinggal'));
  check('4.10 tanpa budget: budgetIdr null', d?.budgetIdr == null, `dapat ${d?.budgetIdr}`);
  check('4.11 tanpa budget: tanpa baris verdict', !fin.res.message.includes('Penilaian kelayakan budget'));
}

console.log(`\n${failed === 0 ? 'SEMUA TES FIX-UP WORKER F LULUS' : 'ADA TES GAGAL'} — lulus ${passed}, gagal ${failed}`);
if (failures.length) console.log('Gagal:', failures.join(' | '));
process.exit(failed === 0 ? 0 : 1);

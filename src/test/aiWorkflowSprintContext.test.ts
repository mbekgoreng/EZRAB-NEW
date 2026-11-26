/**
 * EZRAB AI & WORKFLOW COMPLETION SPRINT — Worker B §3B (2026-11-26).
 *
 * Retensi konteks multi-giliran lewat TITIK MASUK NYATA (bukan parser
 * langsung): giliran pertama via routeIntent → executeIntent, lanjutan
 * via cabang follow-up view.tsx (tryContinueProjectContext /
 * tryContinueUniversalContext / continueRabNeeds / continueRabFinalize,
 * dengan penjaga looksLikeNeedsAnswer + isProjectContextForeign).
 *
 * Cakupan:
 *  1. Contoh verbatim direktif — jembatan 500jt → panjang 20 m → lebar
 *     4 m (panjang BUKAN bentang: pin matrix 13.5f / clarification
 *     1.3–1.11).
 *  2. Jembatan: bentang 12 m + brief review.
 *  3. Rumah 3 giliran + gema anggaran (perbaikan Worker B di
 *     rabSummaryResult) + finalisasi "itu aja".
 *  4. Koreksi multi-giliran ("bukan 2 lantai, 3 lantai").
 *  5. NO-LEAK antar-proyek (penjaga scope proyek).
 *  6. NO-LEAK global → proyek (DIPERBAIKI Worker A 2026-11-26, isolasi
 *     ketat: scopedLastRabNeeds + tryContinueUniversalContext +
 *     penjaga view.tsx — global tak terlihat di proyek, tanpa
 *     self-clean, sehingga sesi global utuh saat kembali ke global).
 *  7. Bentang yang tak pernah dijawab harus masuk daftar hilang di
 *     brief review (TERTUTUP — Worker C sprint: bentang masuk
 *     missingCritical + brief review).
 *  8. Landscape 3 giliran (intake proyek).
 *
 * Cek bertanda [CELAH TERBUKA] menegaskan perilaku yang DIHARAPKAN
 * direktif tetapi BELUM dipenuhi kode saat ini — sengaja gagal sebagai
 * dokumentasi celah yang bisa dieksekusi, BUKAN regresi yang
 * dilembutkan: worker-b-proposed-patch.md merinci tiap celah.
 * Cek bertanda [TERTUTUP — ...] adalah celah yang sudah ditutup oleh
 * pekerjaan lanjutan (sprint fix-up / hardening) dan kini lolos.
 *
 * Jalankan: npx --yes tsx src/test/aiWorkflowSprintContext.test.ts
 * (skrip asersi tsx polos — BUKAN vitest.)
 */
import { routeIntent } from '../ai-tools/ezrab-ai/intentRouter';
import { looksLikeNeedsAnswer } from '../ai-tools/ezrab-ai/rabNeeds';
import {
  executeIntent, continueRabNeeds, continueRabFinalize,
  tryContinueUniversalContext, tryContinueProjectContext,
  getLastRabNeeds, setLastRabNeeds, getUniversalContextState,
  getProjectContextState, hasActiveRabNeeds, clearUniversalContext,
  clearProjectContext, isProjectContextForeign, isUniversalContextForeign,
} from '../ai-tools/ezrab-ai/actionRegistry';
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
const ctxFor = (rawText: string, projectId: string | null = null) => ({
  ...mockCtx,
  activeProject: projectId ? { id: projectId } : null,
  rawText,
}) as never;

function reset(): void {
  setLastRabNeeds(null);
  clearUniversalContext();
  clearProjectContext();
  clearLastRabIntentSpec();
}

type Awaiting = { concept: boolean; needs: boolean };

/** Tiruan setia satu submit view.tsx (cabang follow-up → routing).
 *  Cermin view.tsx sesudah perbaikan B-gap-3 (2026-11-26): penjaga
 *  foreignIntake memakai isUniversalContextForeign (konteks global
 *  tanpa cap = asing di dalam proyek) dan kedua tryContinue menerima
 *  projectId eksplisit (null = global). */
function submit(msg: string, projectId: string | null, awaiting: Awaiting): { res: { message: string }; awaiting: Awaiting } {
  if (awaiting.concept) {
    const foreignProjectCtx = isProjectContextForeign(getProjectContextState(), projectId);
    const liveIntake = getUniversalContextState();
    const foreignIntake = isUniversalContextForeign(liveIntake, projectId);
    const ctxRes = (foreignProjectCtx ? null : tryContinueProjectContext(msg, projectId)) ??
      (foreignIntake ? null : tryContinueUniversalContext(msg, projectId));
    if (ctxRes) return { res: ctxRes, awaiting: { concept: ctxRes.awaitProjectConcept === true, needs: false } };
  }
  if (awaiting.needs) {
    if (looksLikeNeedsAnswer(msg)) {
      const r = continueRabNeeds(msg, projectId);
      return { res: r, awaiting: { concept: false, needs: r.awaitRabNeeds === true } };
    }
  }
  if (hasActiveRabNeeds(projectId)) {
    const fin = continueRabFinalize(msg, projectId);
    if (fin) return { res: fin, awaiting: { concept: false, needs: fin.awaitRabNeeds === true } };
    if (looksLikeNeedsAnswer(msg)) {
      const r = continueRabNeeds(msg, projectId);
      return { res: r, awaiting: { concept: false, needs: r.awaitRabNeeds === true } };
    }
  }
  const routed = routeIntent(msg);
  const res = executeIntent(routed.intent as never, undefined, ctxFor(msg, projectId));
  return { res, awaiting: { concept: (res as { awaitProjectConcept?: boolean }).awaitProjectConcept === true, needs: (res as { awaitRabNeeds?: boolean }).awaitRabNeeds === true } };
}

const uni = () => getUniversalContextState();
const needs = (pid?: string | null) => getLastRabNeeds(pid);

/* ------------------------------------------------------------------ */
/* 1 — Contoh verbatim direktif: jembatan 500jt → 20 m → 4 m          */
/* ------------------------------------------------------------------ */
console.log('== 1 — Direktif verbatim: jembatan 500jt → panjang 20 m → lebar 4 m ==');
{
  reset();
  let st: Awaiting = { concept: false, needs: false };
  let r = submit('Saya mau buat jembatan dengan anggaran 500 juta.', null, st);
  st = r.awaiting;
  check('1.1 T1: kategori jembatan dikenali', r.res.message.includes('Jembatan'));
  check('1.2 T1: anggaran 500jt digema', r.res.message.includes('Rp500.000.000'), r.res.message.slice(0, 200));
  check('1.3 T1: bentang ditanyakan', r.res.message.includes('bentang jembatan'));
  check('1.4 T1: state budget 500000000', uni()?.budget?.amount === 500_000_000, `dapat ${uni()?.budget?.amount}`);
  check('1.5 T1: state primary jembatan', uni()?.primary?.id === 'jembatan', `dapat ${uni()?.primary?.id}`);
  check('1.6 T1: menunggu lanjutan (awaitProjectConcept)', st.concept === true);

  r = submit('Panjang total 20 meter.', null, st);
  st = r.awaiting;
  check('1.7 T2: panjang 20 m dicatat', r.res.message.includes('Panjang: 20 m'), r.res.message.slice(0, 200));
  check('1.8 T2: panjang BUKAN bentang (span tetap null)', uni()?.spanM == null, `span=${uni()?.spanM}`);
  check('1.9 T2: budget 500jt bertahan', uni()?.budget?.amount === 500_000_000);
  check('1.10 T2: kategori jembatan bertahan', uni()?.primary?.id === 'jembatan');
  check('1.11 T2: pertanyaan BARU (konstruksi), bukan ulang bentang/panjang',
    r.res.message.includes('beton') && !r.res.message.includes('Berapa **bentang'));

  r = submit('Lebar 4 meter.', null, st);
  st = r.awaiting;
  check('1.12 T3: lebar 4 m dicatat', r.res.message.includes('Lebar: 4 m'), r.res.message.slice(0, 200));
  check('1.13 T3: panjang 20 m bertahan', uni()?.lengthM === 20, `dapat ${uni()?.lengthM}`);
  check('1.14 T3: lebar 4 m bertahan', uni()?.widthM === 4, `dapat ${uni()?.widthM}`);
  check('1.15 T3: budget 500jt bertahan', uni()?.budget?.amount === 500_000_000);
  check('1.16 T3: span tetap null (belum pernah disebut)', uni()?.spanM == null);
  check('1.17 T3: tidak menanyakan ulang panjang/lebar/anggaran',
    !/berapa (panjang|lebar)|anggaran.*\?/i.test(r.res.message));
}

/* ------------------------------------------------------------------ */
/* 2 — Jembatan: bentang 12 m, lalu brief review                      */
/* ------------------------------------------------------------------ */
console.log('== 2 — Jembatan: bentang 12 m + review ==');
{
  reset();
  let st: Awaiting = { concept: false, needs: false };
  st = submit('Saya mau buat jembatan dengan anggaran 500 juta.', null, st).awaiting;
  st = submit('Panjang total 20 meter.', null, st).awaiting;
  st = submit('Lebar 4 meter.', null, st).awaiting;
  const t4 = submit('Bentang 12 meter.', null, st);
  st = t4.awaiting;
  check('2.1 T4: bentang 12 m dicatat', t4.res.message.includes('Bentang: 12 m'), t4.res.message.slice(0, 200));
  check('2.2 T4: panjang tetap 20 m (bentang tidak menimpa panjang)', uni()?.lengthM === 20, `dapat ${uni()?.lengthM}`);
  check('2.3 T4: span 12 m', uni()?.spanM === 12, `dapat ${uni()?.spanM}`);
  check('2.4 T4: lebar tetap 4 m', uni()?.widthM === 4);
  const t5 = submit('itu aja', null, st);
  check('2.5 T5: review tampil', t5.res.message.includes('Brief proyek'));
  check('2.6 T5: review memuat panjang 20 m', t5.res.message.includes('Panjang pekerjaan: 20 m'));
  check('2.7 T5: review memuat lebar 4 m', t5.res.message.includes('Lebar: 4 m'));
  check('2.8 T5: review memuat bentang 12 m', t5.res.message.includes('Bentang: 12 m'));
  check('2.9 T5: review memuat budget 500jt', t5.res.message.includes('Rp500.000.000'));
  check('2.10 T5: stage PROJECT_REVIEW', uni()?.stage === 'PROJECT_REVIEW', `dapat ${uni()?.stage}`);
}

/* ------------------------------------------------------------------ */
/* 3 — Rumah 3 giliran + gema anggaran + finalisasi                   */
/* ------------------------------------------------------------------ */
console.log('== 3 — Rumah: 2 lantai + 300jt → luas 120 → 3 KT → "itu aja" ==');
{
  reset();
  let st: Awaiting = { concept: false, needs: false };
  const t1 = submit('Saya mau buat rumah 2 lantai dengan anggaran 300 juta.', null, st);
  st = t1.awaiting;
  check('3.1 T1: ringkasan rumah tampil', t1.res.message.includes('rumah tinggal'));
  check('3.2 T1: lantai 2 digema', t1.res.message.includes('2 lantai'));
  check('3.3 T1: anggaran Rp 300.000.000 digema (perbaikan Worker B)', t1.res.message.includes('Rp 300.000.000'), t1.res.message.slice(0, 300));
  check('3.4 T1: spek budget 300jt tersimpan', getLastRabIntentSpec()?.budgetIdr === 300_000_000, `dapat ${getLastRabIntentSpec()?.budgetIdr}`);
  check('3.5 T1: menunggu jawaban (awaitRabNeeds)', st.needs === true);

  const t2 = submit('Luas bangunan 120 m2.', null, st);
  st = t2.awaiting;
  check('3.6 T2: luas 120 dicatat', t2.res.message.includes('120 m²'), t2.res.message.slice(0, 200));
  check('3.7 T2: lantai tetap 2', needs()?.floors === 2, `dapat ${needs()?.floors}`);
  check('3.8 T2: luas 120 tersimpan', needs()?.buildingArea === 120, `dapat ${needs()?.buildingArea}`);
  check('3.9 T2: anggaran 300jt tetap di spek', getLastRabIntentSpec()?.budgetIdr === 300_000_000);

  const t3 = submit('3 kamar tidur.', null, st);
  st = t3.awaiting;
  check('3.10 T3: kamar tidur 3 dicatat', t3.res.message.includes('Kamar tidur: 3'), t3.res.message.slice(0, 200));
  check('3.11 T3: lantai tetap 2 + luas tetap 120', needs()?.floors === 2 && needs()?.buildingArea === 120,
    `lantai=${needs()?.floors} luas=${needs()?.buildingArea}`);
  check('3.12 T3: kamar tidur 3 tersimpan', needs()?.bedrooms === 3, `dapat ${needs()?.bedrooms}`);

  const fin = submit('itu aja', null, st);
  check('3.13 finalisasi: draft RAB rumah disusun', fin.res.message.includes('Draft RAB rumah tinggal'));
  check('3.14 finalisasi: draft memuat 120 m² + 3 kamar', fin.res.message.includes('120 m²') && fin.res.message.includes('3 kamar tidur'));
  check('[TERTUTUP — sprint fix-up] 3.15 finalisasi: draft menggema anggaran 300jt (budget disalurkan ke specRab)',
    fin.res.message.includes('300.000.000'), fin.res.message.slice(0, 300));
}

/* ------------------------------------------------------------------ */
/* 4 — Koreksi multi-giliran                                          */
/* ------------------------------------------------------------------ */
console.log('== 4 — Koreksi: hanya field yang disebut yang berubah ==');
{
  reset();
  let st: Awaiting = { concept: false, needs: false };
  st = submit('Saya mau buat rumah 2 lantai dengan anggaran 300 juta.', null, st).awaiting;
  st = submit('Luas bangunan 120 m2.', null, st).awaiting;
  st = submit('3 kamar tidur.', null, st).awaiting;
  const corr = submit('3 lantai', null, st);
  check('4.1 koreksi polos "3 lantai" → lantai 3', needs()?.floors === 3, `dapat ${needs()?.floors}`);
  check('4.2 koreksi polos: luas 120 + 3 KT bertahan', needs()?.buildingArea === 120 && needs()?.bedrooms === 3);
  check('4.3 koreksi polos: spek lantai 3', getLastRabIntentSpec()?.floors === 3, `dapat ${getLastRabIntentSpec()?.floors}`);

  reset();
  st = { concept: false, needs: false };
  st = submit('Saya mau buat rumah 2 lantai dengan anggaran 300 juta.', null, st).awaiting;
  st = submit('Luas bangunan 120 m2.', null, st).awaiting;
  st = submit('3 kamar tidur.', null, st).awaiting;
  submit('bukan 2 lantai, 3 lantai', null, st);
  check('[TERTUTUP — hardening Worker F] 4.4 koreksi "bukan 2 lantai, 3 lantai" → lantai 3',
    needs()?.floors === 3, `dapat ${needs()?.floors}`);
  check('[TERTUTUP — hardening Worker F] 4.5 koreksi "bukan 2 lantai, 3 lantai" → spek lantai 3',
    getLastRabIntentSpec()?.floors === 3, `dapat ${getLastRabIntentSpec()?.floors}`);
  check('4.6 koreksi negasi: luas 120 + 3 KT tetap bertahan', needs()?.buildingArea === 120 && needs()?.bedrooms === 3);
}

/* ------------------------------------------------------------------ */
/* 5 — NO-LEAK: proyek A (jembatan) → proyek B (rumah)                */
/* ------------------------------------------------------------------ */
console.log('== 5 — NO-LEAK: proyek A jembatan 500jt → proyek B rumah ==');
{
  reset();
  let stA: Awaiting = { concept: false, needs: false };
  stA = submit('Saya mau buat jembatan dengan anggaran 500 juta.', 'proj-A', stA).awaiting;
  check('5.1 A: konteks jembatan dicap proj-A', uni()?.projectId === 'proj-A', `dapat ${uni()?.projectId}`);
  check('5.2 B: belum ada sesi needs di proj-B', hasActiveRabNeeds('proj-B') === false);
  const followB = submit('Panjang total 20 meter.', 'proj-B', { concept: true, needs: false });
  check('5.3 B: lanjutan tidak menggabung ke konteks A (panjang tetap null)', uni()?.lengthM == null, `dapat ${uni()?.lengthM}`);
  check('5.4 B: konteks A utuh (primary jembatan, budget 500jt)', uni()?.primary?.id === 'jembatan' && uni()?.budget?.amount === 500_000_000);
  check('5.5 B: lanjutan asing tidak dibalas sebagai lanjutan jembatan', !followB.res.message.includes('Panjang: 20 m'));
  const houseB = submit('Saya mau buat rumah 2 lantai.', 'proj-B', { concept: false, needs: false });
  check('5.6 B: rumah baru tampil tanpa residu jembatan', !houseB.res.message.includes('jembatan') && !houseB.res.message.includes('500'));
  check('5.7 B: needs proj-B = rumah 2 lantai', needs('proj-B')?.kind === 'rumah' && needs('proj-B')?.floors === 2,
    `kind=${needs('proj-B')?.kind} lantai=${needs('proj-B')?.floors}`);
  check('5.8 A: baca needs dengan proj-A → null (bukan milik A)', needs('proj-A') === null);
}

/* ------------------------------------------------------------------ */
/* 6 — NO-LEAK: konteks global (tanpa proyek) → proyek                */
/* ------------------------------------------------------------------ */
console.log('== 6 — NO-LEAK: konteks global → proyek (DIPERBAIKI B-gap-3, Worker A 2026-11-26) ==');
{
  reset();
  let st: Awaiting = { concept: false, needs: false };
  st = submit('Saya mau buat jembatan dengan anggaran 500 juta.', null, st).awaiting;
  check('6.1 global: konteks jembatan tanpa cap proyek', uni()?.projectId == null, `dapat ${uni()?.projectId}`);
  submit('Panjang total 20 meter.', 'proj-B', { concept: true, needs: false });
  check('6.2 global→proyek: panjang TIDAK boleh masuk konteks global dari giliran proj-B (isolasi ketat: isUniversalContextForeign + tryContinueUniversalContext(msg, projectId))',
    uni()?.lengthM == null, `dapat ${uni()?.lengthM}`);

  reset();
  st = { concept: false, needs: false };
  st = submit('Saya mau buat rumah 2 lantai dengan anggaran 300 juta.', null, st).awaiting;
  check('6.3 global: sesi rumah global aktif', needs()?.kind === 'rumah');
  check('6.4 global→proyek: needs global TIDAK boleh terbaca dari proj-B (isolasi ketat: scopedLastRabNeeds, stored null + projectId non-null → null tanpa self-clean)',
    needs('proj-B') === null, `dapat kind=${needs('proj-B')?.kind}`);
  check('6.5 global→proyek: hasActiveRabNeeds(proj-B) harus false',
    hasActiveRabNeeds('proj-B') === false, `dapat ${hasActiveRabNeeds('proj-B')}`);
}

/* ------------------------------------------------------------------ */
/* 7 — Bentang yang tak dijawab harus masuk daftar hilang di review    */
/* ------------------------------------------------------------------ */
console.log('== 7 — Bentang tak dijawab → daftar hilang di review (TERTUTUP — Worker C sprint) ==');
{
  reset();
  let st: Awaiting = { concept: false, needs: false };
  st = submit('Saya mau buat jembatan dengan anggaran 500 juta.', null, st).awaiting;
  st = submit('Panjang total 20 meter.', null, st).awaiting;
  st = submit('Lebar 4 meter.', null, st).awaiting;
  const review = submit('itu aja', null, st);
  const missingSection = review.res.message.split('Info yang masih hilang')[1]?.split('Cakupan katalog')[0] ?? '';
  check('7.1 review tampil', review.res.message.includes('Brief proyek'));
  check('[TERTUTUP — Worker C sprint] 7.2 seksi hilang menyebut bentang',
    /bentang/i.test(missingSection), missingSection.slice(0, 300));
}

/* ------------------------------------------------------------------ */
/* 8 — Landscape 3 giliran (intake proyek)                            */
/* ------------------------------------------------------------------ */
console.log('== 8 — Landscape: 1 hektar → konsep → kolam ==');
{
  reset();
  let st: Awaiting = { concept: false, needs: false };
  const t1 = submit('Buatkan RAB landscape taman 1 hektar.', null, st);
  st = t1.awaiting;
  check('8.1 T1: luas 1 hektar (10.000 m²) digema', t1.res.message.includes('1 hektar'));
  check('8.2 T1: konsep ditanyakan', t1.res.message.includes('Landscape seperti apa'));
  check('8.3 T1: state area 10000', getProjectContextState()?.landAreaM2 === 10000, `dapat ${getProjectContextState()?.landAreaM2}`);
  const t2 = submit('Konsep taman bermain anak.', null, st);
  st = t2.awaiting;
  check('8.4 T2: playground ditambahkan', (getProjectContextState()?.facilities ?? []).includes('playground'),
    JSON.stringify(getProjectContextState()?.facilities));
  check('8.5 T2: luas 1 hektar bertahan', getProjectContextState()?.landAreaM2 === 10000);
  check('8.6 T2: jawaban menggema luas 1 hektar', t2.res.message.includes('1 hektar'));
  const t3 = submit('Tambah kolam renang.', null, st);
  check('8.7 T3: kolam ditambahkan', (getProjectContextState()?.facilities ?? []).includes('pool'),
    JSON.stringify(getProjectContextState()?.facilities));
  check('8.8 T3: luas + playground bertahan', getProjectContextState()?.landAreaM2 === 10000 &&
    (getProjectContextState()?.facilities ?? []).includes('playground'));
  check('8.9 T3: jawaban menggema luas 1 hektar', t3.res.message.includes('1 hektar'));
}

console.log(`\n${failed === 0 ? 'SEMUA TES KONTEKS MULTI-GILIRAN LULUS' : 'ADA TES GAGAL (lihat [CELAH TERBUKA])'} — lulus ${passed}, gagal ${failed}`);
if (failures.length) console.log('Gagal:', failures.join(' | '));
process.exit(failed === 0 ? 0 : 1);

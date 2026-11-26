/**
 * EZRAB AI WORKFLOW HARDENING — Worker A, B-GAP-3 STRICT PROJECT
 * CONTEXT ISOLATION (2026-11-26, keputusan owner FINAL).
 *
 * Isolasi ketat konteks chat: konteks GLOBAL (tanpa proyek) tidak
 * pernah diwarisi otomatis oleh proyek; proyek A tidak pernah membaca /
 * memfinalisasi / mengubah draft proyek B lewat resolusi implisit;
 * getLastRabNeeds(projectId) hanya mengembalikan konteks proyek itu;
 * sesi global tetap hidup sendiri. Global di dalam proyek itu
 * INVISIBLE-but-PRESERVED: pembacaan lintas-scope mengembalikan null
 * TANPA self-clean, sehingga kembali ke chat global memulihkan sesinya.
 * Satu-satunya transfer yang didukung adalah transfer DRAFT lewat
 * approval binding (draftPersistence) — tidak ada API transfer konteks
 * chat, dan tidak ada yang diciptakan di sini.
 *
 * Keterbatasan arsitektur yang DIKETAHUI (bukan celah yang ditutup di
 * sini): singleton live (lastRabNeeds / universalCtx / projectCtx)
 * hanya memegang SATU sesi — aktivitas proyek B MENGGANTIKAN slot yang
 * sebelumnya dipegang proyek A. Yang dijamin kasus 8/9 adalah: sesudah
 * aktivitas B, giliran di A tidak melihat konteks B, "itu aja" di A
 * tidak memfinalisasi draft B, dan A tetap bisa memulai + memfinalisasi
 * intake-nya sendiri. Pelestarian sesi per proyek lintas ganti proyek
 * hidup di lapisan persistensi per-proyek (home state / draft), bukan
 * di singleton live.
 *
 * Jalankan: npx --yes tsx src/test/aiWorkflowHardeningIsolation.test.ts
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
import { clearLastRabIntentSpec } from '../ai-tools/ezrab-ai/rabIntentFlow';
import { buildUniversalDraft } from '../ai-tools/ezrab-ai/universalRab';
import {
  createTransferApprovalBinding,
  checkTransferApprovalBinding, TRANSFER_APPROVAL_TTL_MS,
} from '../ai-tools/ezrab-ai/draftPersistence';

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

/** Tiruan setia satu submit view.tsx sesudah perbaikan B-gap-3. */
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

/** Rumah lengkap 3 giliran di scope yang diminta; kembalikan awaiting. */
function houseFlow(projectId: string | null): Awaiting {
  let st: Awaiting = { concept: false, needs: false };
  st = submit('Saya mau buat rumah 2 lantai dengan anggaran 300 juta.', projectId, st).awaiting;
  st = submit('Luas bangunan 120 m2.', projectId, st).awaiting;
  st = submit('3 kamar tidur.', projectId, st).awaiting;
  return st;
}

/* ------------------------------------------------------------------ */
/* 1 — Global tidak bisa diambil lewat Proyek A (needs + preserved)   */
/* ------------------------------------------------------------------ */
console.log('== 1 — Global tidak bisa diambil lewat Proyek A ==');
{
  reset();
  houseFlow(null);
  check('1.1 global: sesi rumah global aktif', needs()?.kind === 'rumah' && needs()?.floors === 2);
  check('1.2 global→A: getLastRabNeeds(proj-A) null', needs('proj-A') === null, `dapat kind=${needs('proj-A')?.kind}`);
  check('1.3 global→A: hasActiveRabNeeds(proj-A) false', hasActiveRabNeeds('proj-A') === false);
  check('1.4 global→A: getLastRabNeeds(proj-A) kedua kali tetap null (bukan self-clean sekali-pakai)', needs('proj-A') === null);
  check('1.5 global PRESERVED: sesi global utuh sesudah dibaca dari A (tanpa self-clean)', needs(null)?.kind === 'rumah' && needs(null)?.floors === 2 && needs(null)?.buildingArea === 120,
    `kind=${needs(null)?.kind} lantai=${needs(null)?.floors} luas=${needs(null)?.buildingArea}`);
  check('1.6 global PRESERVED: hasActiveRabNeeds(null) tetap true', hasActiveRabNeeds(null) === true);
}

/* ------------------------------------------------------------------ */
/* 2 — Global tidak bisa diambil lewat Proyek B (universal ctx)        */
/* ------------------------------------------------------------------ */
console.log('== 2 — Global tidak bisa diambil lewat Proyek B ==');
{
  reset();
  let st: Awaiting = { concept: false, needs: false };
  st = submit('Saya mau buat jembatan dengan anggaran 500 juta.', null, st).awaiting;
  check('2.1 global: konteks jembatan tanpa cap', uni()?.projectId == null && uni()?.primary?.id === 'jembatan');
  check('2.2 global→B: isUniversalContextForeign(global, proj-B) true', isUniversalContextForeign(uni(), 'proj-B') === true);
  const cont = tryContinueUniversalContext('Panjang total 20 meter.', 'proj-B');
  check('2.3 global→B: tryContinueUniversalContext(msg, proj-B) null', cont === null);
  check('2.4 global→B: panjang TIDAK masuk konteks global', uni()?.lengthM == null, `dapat ${uni()?.lengthM}`);
  check('2.5 global PRESERVED: konteks jembatan utuh (budget 500jt, primary jembatan)',
    uni()?.primary?.id === 'jembatan' && uni()?.budget?.amount === 500_000_000);
  const followB = submit('Panjang total 20 meter.', 'proj-B', { concept: true, needs: false });
  check('2.6 global→B: giliran proj-B tidak dibalas sebagai lanjutan jembatan', !followB.res.message.includes('Panjang: 20 m'));
  check('2.7 global PRESERVED sesudah giliran proj-B: konteks global tetap tanpa panjang', uni()?.lengthM == null);
}

/* ------------------------------------------------------------------ */
/* 3 — Proyek A tidak bisa diambil lewat Proyek B                      */
/* ------------------------------------------------------------------ */
console.log('== 3 — Proyek A tidak bisa diambil lewat Proyek B ==');
{
  reset();
  houseFlow('proj-A');
  check('3.1 A: needs proj-A = rumah 2 lantai 120 m²', needs('proj-A')?.kind === 'rumah' && needs('proj-A')?.floors === 2 && needs('proj-A')?.buildingArea === 120);
  check('3.2 A→B: getLastRabNeeds(proj-B) null', needs('proj-B') === null, `dapat kind=${needs('proj-B')?.kind}`);
  check('3.3 A→B: hasActiveRabNeeds(proj-B) false', hasActiveRabNeeds('proj-B') === false);
}

/* ------------------------------------------------------------------ */
/* 4 — Proyek B tidak bisa diambil lewat Proyek A                      */
/* ------------------------------------------------------------------ */
console.log('== 4 — Proyek B tidak bisa diambil lewat Proyek A ==');
{
  reset();
  houseFlow('proj-B');
  check('4.1 B: needs proj-B = rumah 2 lantai 120 m²', needs('proj-B')?.kind === 'rumah' && needs('proj-B')?.floors === 2 && needs('proj-B')?.buildingArea === 120);
  check('4.2 B→A: getLastRabNeeds(proj-A) null', needs('proj-A') === null, `dapat kind=${needs('proj-A')?.kind}`);
  check('4.3 B→A: hasActiveRabNeeds(proj-A) false', hasActiveRabNeeds('proj-A') === false);
}

/* ------------------------------------------------------------------ */
/* 5 — "itu aja" di proyek TIDAK BOLEH memfinalisasi konteks global    */
/* ------------------------------------------------------------------ */
console.log('== 5 — "itu aja" di proyek tidak memfinalisasi konteks global ==');
{
  reset();
  houseFlow(null);
  check('5.1 global: sesi rumah global aktif sebelum "itu aja" di proj-B', needs(null)?.kind === 'rumah');
  const fin = submit('itu aja', 'proj-B', { concept: false, needs: false });
  check('5.2 proj-B "itu aja": TIDAK menyusun draft RAB rumah global',
    !fin.res.message.includes('Draft RAB rumah tinggal'), fin.res.message.slice(0, 200));
  check('5.3 global PRESERVED: sesi rumah global utuh sesudah "itu aja" di proj-B',
    needs(null)?.kind === 'rumah' && needs(null)?.floors === 2 && needs(null)?.buildingArea === 120 && needs(null)?.bedrooms === 3,
    `kind=${needs(null)?.kind} lantai=${needs(null)?.floors} luas=${needs(null)?.buildingArea} KT=${needs(null)?.bedrooms}`);
  check('5.4 global PRESERVED: hasActiveRabNeeds(null) tetap true', hasActiveRabNeeds(null) === true);
  check('5.5 global: "itu aja" di GLOBAL tetap memfinalisasi draftnya sendiri',
    submit('itu aja', null, { concept: false, needs: false }).res.message.includes('Draft RAB rumah tinggal'));
}

/* ------------------------------------------------------------------ */
/* 6 — "itu aja" di proyek TIDAK BOLEH memfinalisasi draft proyek lain */
/* ------------------------------------------------------------------ */
console.log('== 6 — "itu aja" di proyek tidak memfinalisasi draft proyek lain ==');
{
  reset();
  houseFlow('proj-A');
  check('6.1 A: sesi rumah proj-A aktif', needs('proj-A')?.kind === 'rumah');
  const finB = submit('itu aja', 'proj-B', { concept: false, needs: false });
  check('6.2 proj-B "itu aja": TIDAK menyusun draft RAB rumah milik proj-A',
    !finB.res.message.includes('Draft RAB rumah tinggal'), finB.res.message.slice(0, 200));
  check('6.3 proj-B "itu aja": TIDAK membaca kebutuhan A ke B (needs proj-B tetap null)',
    needs('proj-B') === null, `dapat kind=${needs('proj-B')?.kind}`);
  // Aturan B1 pra-ada yang DIPERTAHANKAN untuk antar-proyek (bukan
  // bagian dari perbaikan ini): pembacaan lintas-proyek membersihkan
  // sendiri slot live — jadi sesi live A TIDAK dipertahankan sesudah
  // giliran B (berbeda dengan kasus global↔proyek di §5 yang tanpa
  // self-clean). Yang dijamin: tidak ada draft A yang dibangun di B,
  // dan A bisa memulai intake baru (lihat §8.5); record tersimpan
  // per-proyek (home state) tidak tersentuh oleh self-clean ini.
  check('6.4 antar-proyek: pembacaan lintas-proyek membersihkan slot live (aturan B1 pra-ada) — needs proj-A null sesudah giliran B',
    needs('proj-A') === null);
}

/* ------------------------------------------------------------------ */
/* 7 — Global tetap bisa dipakai lewat lookup global                   */
/* ------------------------------------------------------------------ */
console.log('== 7 — Global tetap bisa dipakai lewat lookup global ==');
{
  reset();
  houseFlow(null);
  check('7.1 global: getLastRabNeeds(null) = rumah global', needs(null)?.kind === 'rumah');
  check('7.2 global: getLastRabNeeds() tanpa argumen (legacy) = rumah global', needs()?.kind === 'rumah');
  check('7.3 global: hasActiveRabNeeds(null) true', hasActiveRabNeeds(null) === true);
  const fin = submit('itu aja', null, { concept: false, needs: false });
  check('7.4 global: "itu aja" di global memfinalisasi draft rumah global',
    fin.res.message.includes('Draft RAB rumah tinggal') && fin.res.message.includes('120 m²') && fin.res.message.includes('3 kamar tidur'),
    fin.res.message.slice(0, 200));
  // Universal: konteks global tetap bisa dilanjutkan dari global.
  reset();
  let st: Awaiting = { concept: false, needs: false };
  st = submit('Saya mau buat jembatan dengan anggaran 500 juta.', null, st).awaiting;
  const cont = submit('Panjang total 20 meter.', null, st);
  check('7.5 global: lanjutan jembatan dari global tetap menggabung (panjang 20 m)',
    uni()?.lengthM === 20 && cont.res.message.includes('Panjang: 20 m'), `lengthM=${uni()?.lengthM}`);
}

/* ------------------------------------------------------------------ */
/* 8 — Proyek A tetap bisa dipakai sesudah aktivitas Proyek B          */
/* ------------------------------------------------------------------ */
console.log('== 8 — Proyek A tetap bisa dipakai sesudah aktivitas Proyek B ==');
{
  reset();
  houseFlow('proj-A');
  check('8.1 A: sesi rumah proj-A aktif', needs('proj-A')?.kind === 'rumah');
  // Aktivitas B: intake rumah sendiri di proj-B (menggantikan slot live).
  houseFlow('proj-B');
  check('8.2 B: sesi rumah proj-B aktif (slot live kini milik B)', needs('proj-B')?.kind === 'rumah');
  check('8.3 A sesudah B: needs proj-A TIDAK menyajikan konteks B', needs('proj-A') === null);
  check('8.4 A sesudah B: "itu aja" di A TIDAK memfinalisasi draft B',
    !submit('itu aja', 'proj-A', { concept: false, needs: false }).res.message.includes('Draft RAB rumah tinggal'));
  // A memulai intake-nya sendiri lagi dan memfinalisasi draft A.
  const stA = houseFlow('proj-A');
  void stA;
  const finA = submit('itu aja', 'proj-A', { concept: false, needs: false });
  check('8.5 A: intake baru di A + "itu aja" memfinalisasi draft A sendiri (120 m², 3 KT)',
    finA.res.message.includes('Draft RAB rumah tinggal') && finA.res.message.includes('120 m²') && finA.res.message.includes('3 kamar tidur'),
    finA.res.message.slice(0, 200));
}

/* ------------------------------------------------------------------ */
/* 9 — Proyek B tetap bisa dipakai sesudah aktivitas Proyek A          */
/* ------------------------------------------------------------------ */
console.log('== 9 — Proyek B tetap bisa dipakai sesudah aktivitas Proyek A ==');
{
  reset();
  houseFlow('proj-B');
  check('9.1 B: sesi rumah proj-B aktif', needs('proj-B')?.kind === 'rumah');
  houseFlow('proj-A');
  check('9.2 A: sesi rumah proj-A aktif (slot live kini milik A)', needs('proj-A')?.kind === 'rumah');
  check('9.3 B sesudah A: needs proj-B TIDAK menyajikan konteks A', needs('proj-B') === null);
  check('9.4 B sesudah A: "itu aja" di B TIDAK memfinalisasi draft A',
    !submit('itu aja', 'proj-B', { concept: false, needs: false }).res.message.includes('Draft RAB rumah tinggal'));
  const stB = houseFlow('proj-B');
  void stB;
  const finB = submit('itu aja', 'proj-B', { concept: false, needs: false });
  check('9.5 B: intake baru di B + "itu aja" memfinalisasi draft B sendiri (120 m², 3 KT)',
    finB.res.message.includes('Draft RAB rumah tinggal') && finB.res.message.includes('120 m²') && finB.res.message.includes('3 kamar tidur'),
    finB.res.message.slice(0, 200));
}

/* ------------------------------------------------------------------ */
/* 10 — Transfer eksplisit yang didukung tetap bekerja                 */
/* ------------------------------------------------------------------ */
console.log('== 10 — Transfer eksplisit (approval binding draft) tetap bekerja ==');
{
  // TIDAK ADA API transfer konteks chat (lastRabNeeds / universalCtx
  // tidak punya jalur transfer) — yang didukung adalah transfer DRAFT
  // lewat approval binding: pratinjau yang ditinjau pengguna, terikat
  // draft + proyek + versi + TTL 10 menit. Tanpa binding, tanpa
  // pratinjau, atau proyek berganti → transfer DITOLAK.
  reset();
  const built = buildUniversalDraft('buatkan rab rumah 2 lantai luas bangunan 120 m2 pondasi foot plat lengkap dari pondasi sampai atap');
  check('10.1 prasyarat: draft sumber terbentuk', built.kind === 'draft', `dapat ${built.kind}`);
  if (built.kind === 'draft') {
    const fd = built.draft;
    const binding = createTransferApprovalBinding(fd, 'proj-A');
    check('10.2 transfer eksplisit: binding segar untuk proj-A → ok',
      checkTransferApprovalBinding(binding, fd, 'proj-A').ok === true);
    const wrongProj = checkTransferApprovalBinding(binding, fd, 'proj-B');
    check('10.3 transfer eksplisit: binding proj-A dipakai di proj-B → PROJECT_CHANGED (ditolak)',
      wrongProj.ok === false && (wrongProj as { reason?: string }).reason === 'PROJECT_CHANGED');
    const noBinding = checkTransferApprovalBinding(null, fd, 'proj-A');
    check('10.4 transfer eksplisit: tanpa pratinjau/binding → NO_BINDING (ditolak)',
      noBinding.ok === false && (noBinding as { reason?: string }).reason === 'NO_BINDING');
    const expired = checkTransferApprovalBinding(binding, fd, 'proj-A', binding.createdAt + TRANSFER_APPROVAL_TTL_MS + 1000);
    check('10.5 transfer eksplisit: lewat TTL 10 menit → EXPIRED (ditolak)',
      expired.ok === false && (expired as { reason?: string }).reason === 'EXPIRED');
  } else {
    check('10.2 (prasyarat gagal)', false);
    check('10.3 (prasyarat gagal)', false);
    check('10.4 (prasyarat gagal)', false);
    check('10.5 (prasyarat gagal)', false);
  }
  // Konteks chat sendiri TIDAK ikut transfer: needs global tidak bisa
  // dipindahkan ke proyek lewat binding draft (binding hanya mengikat
  // draft, bukan singleton chat).
  houseFlow(null);
  check('10.6 konteks chat bukan objek transfer: needs global tetap tak terbaca dari proj-A walau draft bisa ditransfer',
    needs('proj-A') === null);
}

/* ------------------------------------------------------------------ */
/* 11 — Konteks proyek hilang → respons aman (bukan fallback global)  */
/* ------------------------------------------------------------------ */
console.log('== 11 — Konteks proyek hilang → respons aman ==');
{
  reset();
  houseFlow(null); // hanya global yang punya sesi
  check('11.1 proj-C: getLastRabNeeds(proj-C) null', needs('proj-C') === null);
  check('11.2 proj-C: hasActiveRabNeeds(proj-C) false', hasActiveRabNeeds('proj-C') === false);
  check('11.3 proj-C: tryContinueUniversalContext(msg, proj-C) null', tryContinueUniversalContext('Panjang total 20 meter.', 'proj-C') === null);
  const fin = submit('itu aja', 'proj-C', { concept: false, needs: false });
  check('11.4 proj-C "itu aja": TIDAK menyusun draft apa pun (bukan draft global)',
    !fin.res.message.includes('Draft RAB'), fin.res.message.slice(0, 200));
  check('11.5 proj-C "itu aja": jawaban aman, bukan crash (ada pesan)', fin.res.message.length > 0);
  check('11.6 global tetap utuh sesudah "itu aja" di proj-C', needs(null)?.kind === 'rumah');
}

/* ------------------------------------------------------------------ */
/* 12 — Regresi: contoh verbatim direktif (jembatan, global)          */
/* ------------------------------------------------------------------ */
console.log('== 12 — Regresi: contoh verbatim direktif (jembatan 500jt → 20 m → 4 m → bentang 12 m) ==');
{
  reset();
  let st: Awaiting = { concept: false, needs: false };
  let r = submit('Saya mau buat jembatan dengan anggaran 500 juta.', null, st);
  st = r.awaiting;
  check('12.1 T1: kategori jembatan + anggaran 500jt', r.res.message.includes('Jembatan') && r.res.message.includes('Rp500.000.000'));
  r = submit('Panjang total 20 meter.', null, st);
  st = r.awaiting;
  check('12.2 T2: panjang 20 m, span tetap null', r.res.message.includes('Panjang: 20 m') && uni()?.spanM == null);
  r = submit('Lebar 4 meter.', null, st);
  st = r.awaiting;
  check('12.3 T3: lebar 4 m, panjang 20 m bertahan', r.res.message.includes('Lebar: 4 m') && uni()?.lengthM === 20 && uni()?.widthM === 4);
  r = submit('Bentang 12 meter.', null, st);
  st = r.awaiting;
  check('12.4 T4: bentang 12 m, panjang tetap 20 m', r.res.message.includes('Bentang: 12 m') && uni()?.lengthM === 20 && uni()?.spanM === 12);
  const review = submit('itu aja', null, st);
  check('12.5 T5: review memuat 20 m · 4 m · 12 m · 500jt + stage PROJECT_REVIEW',
    review.res.message.includes('Brief proyek') && review.res.message.includes('Panjang pekerjaan: 20 m') &&
    review.res.message.includes('Bentang: 12 m') && review.res.message.includes('Rp500.000.000') &&
    uni()?.stage === 'PROJECT_REVIEW', review.res.message.slice(0, 200));
}

console.log(`\n${failed === 0 ? 'SEMUA TES ISOLASI STRICT LULUS' : 'ADA TES ISOLASI GAGAL'} — lulus ${passed}, gagal ${failed}`);
if (failures.length) console.log('Gagal:', failures.join(' | '));
process.exit(failed === 0 ? 0 : 1);

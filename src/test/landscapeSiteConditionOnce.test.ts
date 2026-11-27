/**
 * D2 — Pertanyaan yang sudah dijawab tidak ditanya ulang (lapisan bersama).
 *
 * Akar masalah (2026-11-26, kasus live landscape): slot tunggal
 * `ProjectIntakeContext.siteConditions` (projectIntake.ts) + gerbang
 * `intakeNextStep` hanya memeriksa slot kosong; jawaban "lahan perlu
 * dibongkar, jadi termasuk revitalisasi" TIDAK PERNAH tersimpan karena
 * SITE_PATTERNS hanya mengenali "pembongkaran", bukan "dibongkar" /
 * "revitalisasi" — sehingga revisi luas menghitung ulang stage ke
 * 'site' dan pertanyaan kondisi lahan ditanyakan ulang.
 *
 * Perbaikan:
 *  1. `projectIntake.ts` SITE_PATTERNS: entri demolisi menerima bentuk
 *     kata kerja (`dibongkar`/`bongkar`/`perlu dibongkar`) + entri
 *     `revitalisasi` memetakan ke label tunggal yang sama
 *     ('perlu pembongkaran sebagian').
 *  2. `actionRegistry.ts` `tryContinueProjectContext`: `askedSite`
 *     juga lolos bila `beforeStage` adalah 'preview' atau 'technical'
 *     (pertahanan lapis kedua — pertanyaan site sudah lewat).
 *
 * Generalisasi (lapisan bersama, bukan khusus-landscape): jalur
 * continuation intake UNIVERSAL (semua kategori non-landscape) sudah
 * memakai mekanisme yang sama bentuknya — `askedKeys` di
 * `universalIntake.ts` (`selectNextQuestion` melewati kunci yang sudah
 * diajukan) — dipin di §3 untuk rumah: pertanyaan "pembangunan baru"
 * dijawab sekali, lalu revisi luas TIDAK menanyakannya ulang.
 *
 * Jalankan: npx --yes tsx src/test/landscapeSiteConditionOnce.test.ts
 * (skrip asersi tsx polos — BUKAN vitest.)
 */
import {
  executeIntent, tryContinueProjectContext, tryContinueUniversalContext,
  getProjectContextState, getUniversalContextState,
  clearProjectContext, clearUniversalContext,
} from '../ai-tools/ezrab-ai/actionRegistry';
import { extractProjectContext } from '../ai-tools/ezrab-ai/projectIntake';

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail?: unknown): void {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else {
    failed++; failures.push(name);
    console.log(`  ✗ ${name}${detail !== undefined ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
  }
}
const mockCtx = {
  navigate: () => {},
  currentMenu: 'ezrab-ai',
  activeProject: null,
  projects: [],
  projectTotal: null,
};
const ctxFor = (rawText: string) => ({ ...mockCtx, rawText }) as never;
const SITE_Q = /Bagaimana kondisi lahan eksistingnya\?/g;

/* ------------------------------------------------------------------ */
/* 1 — Kasus live landscape: 8 langkah, pertanyaan site tepat 1×      */
/* ------------------------------------------------------------------ */
console.log('== 1 — Landscape: kondisi lahan ditanya tepat satu kali ==');
{
  clearProjectContext();
  const msgs: string[] = [];
  const step = (label: string, fn: () => { message?: string } | null) => {
    const r = fn();
    msgs.push(r?.message ?? '');
    return r;
  };
  step('1', () => executeIntent('CREATE_RAB_SUMMARY', undefined, ctxFor('Saya mau buat RAB landscape, dana 50 juta, luas 1 hektar')));
  step('2', () => tryContinueProjectContext('Taman publik'));
  step('3', () => tryContinueProjectContext('jogging track, playground, dan area parkir'));
  const s4 = step('4', () => tryContinueProjectContext('lahan perlu dibongkar, jadi termasuk revitalisasi'));
  const s5 = step('5', () => tryContinueProjectContext('revisi ternyata untuk luas hanya 895 m2'));
  const s6 = step('6', () => tryContinueProjectContext('itu aja'));
  step('7', () => executeIntent('RAB_PROJECT_PREVIEW', 'generate', ctxFor('')));
  const s8 = step('8', () => tryContinueProjectContext('kan budget saya 50jt'));
  const joined = msgs.join('\n');
  const count = (joined.match(SITE_Q) || []).length;
  check('1.1 pertanyaan kondisi lahan muncul TEPAT 1× dalam 8 langkah', count === 1, count);
  const st4 = getProjectContextState();
  // NB: sesudah langkah 7 konteks proyek di-null-kan (draft tersusun);
  // keadaan site dicek lewat pesan langkah 4/5/6, bukan state akhir.
  void st4;
  check('1.2 langkah 4 mengakui kondisi lahan (demolisi)', (s4?.message ?? '').includes('perlu pembongkaran sebagian'), (s4?.message ?? '').slice(0, 200));
  check('1.3 langkah 5 TIDAK menanyakan kondisi lahan lagi', !SITE_Q.test(s5?.message ?? ''), (s5?.message ?? '').slice(0, 200));
  check('1.4 langkah 5 menyebut luas revisi 895 m²', (s5?.message ?? '').includes('895 m²'), (s5?.message ?? '').slice(0, 200));
  check('1.5 pratinjau langkah 4 TIDAK memuat "Masih belum jelas: kondisi lahan eksisting"',
    !(s4?.message ?? '').includes('Masih belum jelas: kondisi lahan eksisting'), (s4?.message ?? '').slice(0, 300));
  check('1.6 pratinjau langkah 6 TIDAK memuat "Masih belum jelas: kondisi lahan eksisting"',
    !(s6?.message ?? '').includes('Masih belum jelas: kondisi lahan eksisting'), (s6?.message ?? '').slice(0, 300));
  check('1.7 TIDAK ADA "Kondisi lahan dianggap standar" di 8 langkah', !joined.includes('Kondisi lahan dianggap standar'));
  check('1.8 langkah 8 (sesudah draft) mengembalikan null (tidak ada tanya-ulang)', s8 === null, s8 === null ? 'null' : (s8?.message ?? '').slice(0, 120));
}

/* ------------------------------------------------------------------ */
/* 2 — Unit: ekstraktor kondisi lahan                                 */
/* ------------------------------------------------------------------ */
console.log('== 2 — Unit ekstraktor SITE_PATTERNS ==');
{
  const c1 = extractProjectContext('lahan perlu dibongkar, jadi termasuk revitalisasi');
  check('2.1 "dibongkar … revitalisasi" → siteConditions non-empty', c1.siteConditions.length > 0, c1.siteConditions);
  check('2.2 label = perlu pembongkaran sebagian', c1.siteConditions.includes('perlu pembongkaran sebagian'), c1.siteConditions);
  const c2 = extractProjectContext('lahan perlu dibongkar');
  check('2.3 "perlu dibongkar" saja → demolisi', c2.siteConditions.includes('perlu pembongkaran sebagian'), c2.siteConditions);
  const c3 = extractProjectContext('lahan ini revitalisasi taman lama');
  check('2.4 "revitalisasi" saja → demolisi (label tunggal)', c3.siteConditions.includes('perlu pembongkaran sebagian'), c3.siteConditions);
  const c4 = extractProjectContext('lahan kosong');
  check('2.5 "lahan kosong" tetap label sendiri', c4.siteConditions.includes('lahan kosong'), c4.siteConditions);
  // State sesudah langkah 4 urutan §1 (sebelum draft): site tersimpan.
  clearProjectContext();
  executeIntent('CREATE_RAB_SUMMARY', undefined, ctxFor('Saya mau buat RAB landscape, dana 50 juta, luas 1 hektar'));
  tryContinueProjectContext('Taman publik');
  tryContinueProjectContext('jogging track, playground, dan area parkir');
  tryContinueProjectContext('lahan perlu dibongkar, jadi termasuk revitalisasi');
  const st = getProjectContextState();
  check('2.6 sesudah langkah 4: siteConditions.length > 0 (demolisi)', (st?.siteConditions.length ?? 0) > 0, st?.siteConditions);
  check('2.7 sesudah langkah 4: stage BUKAN site', st?.stage !== 'site', st?.stage);
}

/* ------------------------------------------------------------------ */
/* 3 — Non-landscape (rumah, jalur universal): askedKeys bersama      */
/* ------------------------------------------------------------------ */
console.log('== 3 — Rumah (universal intake): pertanyaan tidak diulang ==');
{
  clearProjectContext();
  clearUniversalContext();
  const msgs: string[] = [];
  const r1 = executeIntent('CREATE_RAB_SUMMARY', undefined, ctxFor('Buat RAB rumah 2 lantai dan pagar keliling'));
  msgs.push(r1?.message ?? '');
  const qRe = /Apakah bangunan rumah tinggal-nya termasuk/;
  check('3.1 pertanyaan "pembangunan baru" diajukan sekali di awal', qRe.test(r1?.message ?? ''), (r1?.message ?? '').slice(0, 200));
  const r2 = tryContinueUniversalContext('baru');
  msgs.push(r2?.message ?? '');
  check('3.2 jawaban "baru" dicatat (bukan pertanyaan ulang)', (r2?.message ?? '').includes('pembangunan baru'), (r2?.message ?? '').slice(0, 200));
  const r3 = tryContinueUniversalContext('revisi luas bangunan jadi 150 m2');
  msgs.push(r3?.message ?? '');
  const joined = msgs.join('\n');
  const qCount = (joined.match(qRe) || []).length;
  check('3.3 pertanyaan "pembangunan baru" muncul TEPAT 1× dalam 3 langkah', qCount === 1, qCount);
  check('3.4 revisi luas TIDAK menanyakan ulang — sampai ke brief', (r3?.message ?? '').includes('Brief proyek'), (r3?.message ?? '').slice(0, 250));
  check('3.5 revisi luas tercatat 150 m²', (r3?.message ?? '').includes('150 m²'), (r3?.message ?? '').slice(0, 250));
  const ust = getUniversalContextState();
  check('3.6 askedKeys memuat new-construction + building-area', !!ust && ust.askedKeys.includes('new-construction') && ust.askedKeys.includes('building-area'), ust?.askedKeys);
  clearUniversalContext();
}

console.log(`\nlandscapeSiteConditionOnce: ${passed} lulus, ${failed} gagal${failed ? ` — ${failures.join('; ')}` : ''}`);
if (failed > 0) process.exit(1);

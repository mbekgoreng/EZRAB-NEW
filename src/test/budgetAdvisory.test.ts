/**
 * Budget-advisory — rekomendasi ukuran/tipe rumah dari budget
 * (perintah owner 2026-11-28 04:12).
 *
 * CACAT: "saya ada budget 100jt ingin membuat rumah, sebaiknya rumah
 * dengan ukuran berapa dan tipe berapa yang bisa saya bangun?" dijawab
 * ringkasan kebutuhan kosong + minta pengguna melengkapi luas/tanah —
 * padahal ukuran/tipe itulah yang didelegasikan ke AI.
 *
 * PERILAKU BENAR (dipin di sini):
 *  - Pertanyaan saran-budget (budget disebut + frasa saran + rumah,
 *    TANPA ukuran/tipe eksplisit) dijawab REKOMENDASI dari data EZRAB
 *    sendiri (HouseTypeCatalog + mesin parametrik buildDirectRab:
 *    template + AHSP 2026 + indeks harga) — bukan ringkasan kebutuhan,
 *    bukan jawaban model bebas. Frasa jawaban mengikuti pola yang
 *    diminta owner: "Dengan budget RpX, menurut perhitungan saya Anda
 *    bisa membangun rumah dengan ukuran ... dan tipe ...".
 *  - Aturan echo-first 2026-11-26 TIDAK berubah: permintaan yang SUDAH
 *    menyebut spek (tipe/luas) tetap lewat jalur lama.
 *  - Budget mustahil (Rp10jt) dijawab jujur "belum bisa" + opsi
 *    termurah nyata + selisihnya — bukan karangan yang dipaksakan muat.
 *
 * Angka yang dipin di bawah DIHITUNG mesin (bukan sintetis) — diverifikasi
 * via probe buildDirectRab 2026-11-28:
 *  Type 36 standar (1 lantai) = Rp116.737.891 (PARSIAL, 24/25 item
 *  berharga); Type 45 = Rp134.083.059; Type 54 = Rp149.755.253;
 *  Type 60 = Rp159.240.910; Type 70 = Rp183.726.930.
 *  Tangga luas basis Type 36: 26 m² = Rp98.438.199; 24 m² = Rp94.503.160;
 *  21 m² = Rp88.369.150. Type 36 (2 lantai) = Rp136.829.845.
 *
 * Jalankan: npx --yes tsx src/test/budgetAdvisory.test.ts
 * (skrip asersi tsx polos — BUKAN vitest; tanpa live AI.)
 */
import { routeIntent } from '../ai-tools/ezrab-ai/intentRouter';
import {
  detectBudgetAdvisoryIntent,
  computeBudgetAdvisory,
  formatBudgetAdvisoryMessage,
  buildBudgetAdvisoryActions,
} from '../ai-tools/ezrab-ai/budgetAdvisory';
import { extractRabNeeds, stripLandPhrases } from '../ai-tools/ezrab-ai/rabNeeds';
import { buildDirectRab, getLastDirectRab } from '../ai-tools/ezrab-ai/directRab';
import { executeIntent } from '../ai-tools/ezrab-ai/actionRegistry';
import { getLastRabIntentSpec } from '../ai-tools/ezrab-ai/rabIntentFlow';

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

const OWNER_Q =
  'saya ada budget 100jt ingin membuat rumah, sebaiknya rumah dengan ukuran berapa dan tipe berapa yang bisa saya bangun?';

function needsFor(q: string) {
  return extractRabNeeds(stripLandPhrases(q));
}

/* ------------------------------------------------------------------ */
/* 1 — Pertanyaan owner (Rp100jt): rekomendasi, bukan tanya-balik       */
/* ------------------------------------------------------------------ */
console.log('== 1 — Pertanyaan owner Rp100jt ==');
{
  const routed = routeIntent(OWNER_Q);
  check('1.1 router = RAB_BUDGET_ADVISORY', routed.intent === 'RAB_BUDGET_ADVISORY', routed.intent);
  const det = detectBudgetAdvisoryIntent(OWNER_Q);
  check('1.2 deteksi budget Rp100.000.000', det?.budgetIdr === 100_000_000, String(det?.budgetIdr));
  check('1.3 deteksi lantai tidak disebut (null)', det?.floors === null && det?.floorsMentioned === false);
  // Efek samping buildDirectRab tidak boleh menimpa hasil RAB langsung
  // pengguna yang sedang tampil (slot lastDirectRab dipulihkan).
  buildDirectRab('buatkan rab rumah type 70');
  const comp = computeBudgetAdvisory(100_000_000, needsFor(OWNER_Q), det?.floors ?? null);
  check('1.4 slot lastDirectRab dipulihkan (tetap Type 70)', getLastDirectRab()?.houseType === 70, String(getLastDirectRab()?.houseType));
  check('1.5 primary = rumah 26 m² (basis Type 36)', comp.primary?.areaM2 === 26 && comp.primary?.basisType === 36, JSON.stringify(comp.primary?.areaM2));
  check('1.6 primary via denah diskalakan', comp.primary?.viaAreaAdaptation === true);
  check('1.7 primary total Rp98.438.199 (mesin)', comp.primary?.totalRabCost === 98_438_199, String(comp.primary?.totalRabCost));
  check('1.8 primary 1 lantai', comp.primary?.floors === 1);
  check('1.9 alternatif 24 m² + 21 m² ikut muat', comp.fitting.some((o) => o.areaM2 === 24) && comp.fitting.some((o) => o.areaM2 === 21));
  check('1.10 termurah = Type 36 standar Rp116.737.891', comp.cheapest?.basisType === 36 && comp.cheapest?.totalRabCost === 116_737_891, String(comp.cheapest?.totalRabCost));
  check('1.11 Type 36 di atas budget Rp16.737.891', (comp.cheapest?.totalRabCost ?? 0) - 100_000_000 === 16_737_891);
  const msg = formatBudgetAdvisoryMessage(comp);
  check(
    '1.12 frasa penerimaan owner (ukuran + tipe dari perhitungan)',
    msg.startsWith('Dengan budget Rp100.000.000, menurut perhitungan saya Anda bisa membangun rumah dengan ukuran 26 m² dan tipe 36 (1 lantai)'),
    msg.split('\n')[0],
  );
  check('1.13 pesan memuat total + PARSIAL', msg.includes('Rp98.438.199') && msg.includes('PARSIAL'));
  check('1.14 pesan memuat sisa budget Rp1.561.801', msg.includes('Rp1.561.801'));
  check('1.15 pesan memuat basis (template + AHSP 2026)', msg.includes('AHSP 2026') && msg.includes('Type 36'));
  check('1.16 pesan TIDAK meminta luas/tanah', !msg.includes('Lengkapi kebutuhan') && !msg.includes('luas bangunan atau ukuran tanah') && !msg.includes('Berapa lantai?'));
  const actions = buildBudgetAdvisoryActions(comp);
  check('1.17 tiga tombol Lanjut (utama + 2 alternatif)', actions.length === 3, String(actions.length));
  check('1.18 semua tombol = CREATE_RAB_DIRECT', actions.every((a) => a.action.kind === 'intent' && (a.action as any).intent === 'CREATE_RAB_DIRECT'));
  // Tombol "Lanjut" membangun RAB yang SAMA PERSIS (total identik).
  const repro = actions.every((a) => {
    const param = (a.action as { param: string }).param;
    const built = buildDirectRab(param);
    const shown = comp.fitting.find((o) => o.buildParamText === param);
    return built != null && shown != null && built.generation.totalRabCost === shown.totalRabCost;
  });
  check('1.19 param tombol mereproduksi total persis', repro);
}

/* ------------------------------------------------------------------ */
/* 2 — Registry end-to-end (executeIntent)                              */
/* ------------------------------------------------------------------ */
console.log('== 2 — Registry end-to-end ==');
{
  const res = executeIntent('RAB_BUDGET_ADVISORY', undefined, ctxFor(OWNER_Q));
  check('2.1 executeIntent ok', res.ok === true);
  check('2.2 pesan berisi rekomendasi 26 m²', res.message.includes('26 m²') && res.message.includes('Rp98.438.199'));
  check('2.3 pesan TIDAK berisi ringkasan kebutuhan kosong', !res.message.includes('belum disebutkan'));
  check('2.4 tiga aksi Lanjut', (res.actions ?? []).length === 3, String((res.actions ?? []).length));
  check('2.5 tanpa aksi Lengkapi kebutuhan', !(res.actions ?? []).some((a) => a.label.includes('Lengkapi kebutuhan')));
  check('2.6 budget tercatat di spek sesi (Rp100jt)', getLastRabIntentSpec()?.budgetIdr === 100_000_000, String(getLastRabIntentSpec()?.budgetIdr));
}

/* ------------------------------------------------------------------ */
/* 3 — Echo-first TIDAK berubah (spek disebut → jalur lama)             */
/* ------------------------------------------------------------------ */
console.log('== 3 — Echo-first tidak berubah ==');
{
  check(
    '3.1 "buatkan rab rumah type 36 budget 100jt" tetap DIRECT',
    routeIntent('buatkan rab rumah type 36 budget 100jt').intent === 'CREATE_RAB_DIRECT',
  );
  check(
    '3.2 deteksi null bila tipe disebut',
    detectBudgetAdvisoryIntent('buatkan rab rumah type 36 budget 100jt') === null,
  );
  check(
    '3.3 "budget 100jt ingin membuat rumah" (tanpa frasa saran) tetap SUMMARY',
    routeIntent('saya ada budget 100jt ingin membuat rumah').intent === 'CREATE_RAB_SUMMARY',
  );
  check(
    '3.4 deteksi null tanpa frasa saran',
    detectBudgetAdvisoryIntent('saya ada budget 100jt ingin membuat rumah') === null,
  );
  check(
    '3.5 hard test #1 tetap DIRECT ("type 36, kolom 15x15")',
    routeIntent('Buatkan RAB rumah type 36, kolomnya 15x15').intent === 'CREATE_RAB_DIRECT',
  );
  check(
    '3.6 deteksi null bila luas disebut ("luas bangunan 50 m2 ... sebaiknya")',
    detectBudgetAdvisoryIntent('budget 100jt, sebaiknya rumah luas bangunan 50 m2 tipe berapa?') === null,
  );
  check(
    '3.7 deteksi null bila dimensi disebut ("rumah 6x12 ... sebaiknya")',
    detectBudgetAdvisoryIntent('budget 100jt, sebaiknya rumah 6x12 tipe berapa?') === null,
  );
}

/* ------------------------------------------------------------------ */
/* 4 — Budget mustahil (Rp10jt): jujur "belum bisa", bukan karangan     */
/* ------------------------------------------------------------------ */
console.log('== 4 — Budget mustahil Rp10jt ==');
{
  const q = 'saya ada budget 10jt ingin membuat rumah, sebaiknya rumah dengan ukuran berapa dan tipe berapa yang bisa saya bangun?';
  check('4.1 router = advisory', routeIntent(q).intent === 'RAB_BUDGET_ADVISORY');
  const comp = computeBudgetAdvisory(10_000_000, needsFor(q), null);
  check('4.2 primary null (tidak ada yang muat)', comp.primary === null);
  check('4.3 termurah Type 36 Rp116.737.891', comp.cheapest?.totalRabCost === 116_737_891);
  check('4.4 tangga terkecil 21 m² Rp88.369.150', comp.smallestLadder?.areaM2 === 21 && comp.smallestLadder?.totalRabCost === 88_369_150, JSON.stringify(comp.smallestLadder?.totalRabCost));
  const msg = formatBudgetAdvisoryMessage(comp);
  check('4.5 pesan "belum bisa membangun" + selisih Rp106.737.891', msg.includes('belum bisa membangun') && msg.includes('Rp106.737.891'));
  check('4.6 pesan TIDAK mengarang yang muat', !msg.includes('Anda bisa membangun'));
  const actions = buildBudgetAdvisoryActions(comp);
  check('4.7 aksi: lanjut Type 36 + 21 m² + manual', actions.length === 3 && actions.some((a) => a.label.includes('Mulai manual')));
}

/* ------------------------------------------------------------------ */
/* 5 — Budget muat tipe standar (Rp150jt → Type 54)                     */
/* ------------------------------------------------------------------ */
console.log('== 5 — Budget muat tipe standar Rp150jt ==');
{
  const q = 'saya ada budget 150jt ingin membuat rumah, sebaiknya rumah dengan ukuran berapa dan tipe berapa yang bisa saya bangun?';
  const comp = computeBudgetAdvisory(150_000_000, needsFor(q), null);
  check('5.1 primary = Type 54 (54 m²)', comp.primary?.basisType === 54 && comp.primary?.areaM2 === 54, JSON.stringify(comp.primary?.areaM2));
  check('5.2 primary total Rp149.755.253', comp.primary?.totalRabCost === 149_755_253, String(comp.primary?.totalRabCost));
  check('5.3 primary tipe standar (bukan denah diskalakan)', comp.primary?.viaAreaAdaptation === false);
  check('5.4 alternatif Type 45 + Type 36', comp.fitting.some((o) => o.basisType === 45) && comp.fitting.some((o) => o.basisType === 36));
  const msg = formatBudgetAdvisoryMessage(comp);
  check('5.5 frasa ukuran 54 m² dan tipe 54', msg.includes('ukuran 54 m² dan tipe 54'));
}

/* ------------------------------------------------------------------ */
/* 6 — Lantai disebut (2 lantai)                                        */
/* ------------------------------------------------------------------ */
console.log('== 6 — Lantai disebut (2 lantai) ==');
{
  const q = 'budget 200jt, sebaiknya rumah 2 lantai tipe berapa yang bisa saya bangun?';
  const det = detectBudgetAdvisoryIntent(q);
  check('6.1 deteksi lantai 2', det?.floors === 2 && det?.floorsMentioned === true);
  const comp = computeBudgetAdvisory(200_000_000, needsFor(q), det?.floors ?? null);
  check('6.2 primary = Type 36 2 lantai (72 m²)', comp.primary?.basisType === 36 && comp.primary?.areaM2 === 72 && comp.primary?.floors === 2, JSON.stringify(comp.primary?.areaM2));
  check('6.3 primary total Rp136.829.845', comp.primary?.totalRabCost === 136_829_845, String(comp.primary?.totalRabCost));
  check('6.4 pesan menyebut 2 lantai', formatBudgetAdvisoryMessage(comp).includes('(2 lantai)'));
  // 2 lantai Rp130jt: Type 36 2 lantai (136,8jt) tidak muat; tangga
  // 70/60/50 m² juga tidak muat; 42 m² (134,6jt) pun tidak muat.
  const comp130 = computeBudgetAdvisory(130_000_000, needsFor(q), 2);
  check('6.5 Rp130jt 2 lantai: primary null', comp130.primary === null);
  check('6.6 tangga terkecil 42 m² Rp134.637.050', comp130.smallestLadder?.areaM2 === 42 && comp130.smallestLadder?.totalRabCost === 134_637_050, JSON.stringify(comp130.smallestLadder?.totalRabCost));
}

/* ------------------------------------------------------------------ */
/* 7 — Penjaga: "full ai" dan DED tidak diambil alih                    */
/* ------------------------------------------------------------------ */
console.log('== 7 — Penjaga full-ai / DED ==');
{
  check(
    '7.1 deteksi null untuk "full ai"',
    detectBudgetAdvisoryIntent('buatkan rab rumah type 36 full ai budget 100jt') === null,
  );
  check(
    '7.2 router "full ai" bukan advisory',
    routeIntent('buatkan rab rumah type 36 full ai budget 100jt').intent !== 'RAB_BUDGET_ADVISORY',
  );
  check(
    '7.3 deteksi null untuk permintaan DED',
    detectBudgetAdvisoryIntent('budget 100jt sebaiknya rumah dari gambar ded tipe berapa yang bisa saya bangun?') === null,
  );
}

/* ------------------------------------------------------------------ */
/* 8 — Tanpa template (3 lantai): jujur, bukan karangan                 */
/* ------------------------------------------------------------------ */
console.log('== 8 — Tanpa template (3 lantai) ==');
{
  const q = 'budget 500jt, sebaiknya rumah 3 lantai tipe berapa yang bisa saya bangun?';
  const det = detectBudgetAdvisoryIntent(q);
  check('8.1 deteksi lantai 3', det?.floors === 3);
  const comp = computeBudgetAdvisory(500_000_000, needsFor(q), det?.floors ?? null);
  check('8.2 tidak ada kandidat (cheapest null)', comp.cheapest === null && comp.candidatesComputed === 0);
  check(
    '8.3 pesan jujur "belum ada template"',
    formatBudgetAdvisoryMessage(comp).includes('belum ada template rumah terdaftar untuk 3 lantai'),
  );
}

console.log(`\nHASIL: ${passed} lulus, ${failed} gagal (total ${passed + failed})`);
if (failed > 0) {
  console.log(`Gagal: ${failures.join(' | ')}`);
  process.exit(1);
}

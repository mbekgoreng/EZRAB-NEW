/**
 * EZRAB AI & WORKFLOW COMPLETION SPRINT — Worker C §3C (2026-11-26).
 *
 * Klarifikasi sadar-rekayasa per kategori lewat mesin pertanyaan NYATA
 * (selectNextQuestion / questionDefsFor di universalIntake.ts,
 * konsep+fasilitas landscape di projectIntake.ts, gerbang intake di
 * actionRegistry): tiap kategori diprobe dengan pesan yang memberi
 * info SEBAGIAN, lalu diverifikasi bahwa sistem menanyakan SATU hal
 * paling penting yang masih hilang — bukan pertanyaan generik, bukan
 * pertanyaan untuk data yang sudah diberikan, dan tidak pernah
 * mengulang pertanyaan yang sudah dijawab.
 *
 * Perbaikan yang dipin di sini (file milik Worker C):
 *  1. PIN REKAYASA bentang≠panjang (celah Worker B §7/7.2):
 *     `bridge-span` tidak lagi dipenuhi `lengthM` — "panjang 20 m"
 *     tidak pernah menjawab bentang, sehingga bentang yang belum
 *     disebut tetap tercatat kritis-hilang sampai ke brief review.
 *     Perilaku tanya-tidak-ulang TIDAK diubah (pin Worker B 1.11:
 *     sesudah "panjang 20 m", giliran berikut menanyakan tipe
 *     konstruksi, bukan mengulang bentang).
 *  2. Penjaga salin-panjang: angka berjangkar lebar/bentang
 *     ("bentang 12 m", "lebar 6 m") tidak lagi tercatat sebagai
 *     panjang total.
 *  3. Retaining wall: panjang tetap dulu (tinggi-dulu sempat dicoba,
 *     tetapi chatUniversalIntake.test.ts mem-pin pertanyaan pertama
 *     bare retaining wall adalah panjang — file tes itu bukan milik
 *     Worker C). Tinggi tetap non-kritis (jalur cepat retaining +
 *     panjang saja dipertahankan) dan ditanyakan pertama bila panjang
 *     sudah diberikan di awal.
 *  4. Urutan gudang: dimensi dulu, baru sistem struktur (sebelumnya
 *     sistem ditanya sebelum dimensi).
 *  5. Drainase: pertanyaan panjang saluran (baru, kritis) sesudah
 *     tipe, sebelum dimensi penampang.
 *  6. Landscape: fasilitas irigasi + hardscape kini terdeteksi di
 *     semua konsep; jawaban fasilitas tidak lagi hilang bila satu
 *     katanya cocok pola kategori lain ("sistem irigasi").
 *
 * Yang SENGAJA tidak diubah (pin perilaku yang dipertahankan):
 *  - bridge-width / drainage-dims / renovation-area tetap NON-kritis
 *    (pin §8 universalClassification.test.ts).
 *  - building-floors tetap NON-kritis: "gudang 1000 m2" harus tetap
 *    jalur cepat draft (chatUniversalIntake) dan "gudang 500 m2"
 *    tetap draft + vonis anggaran (rabIntentFirstFlow §12.15/12.16).
 *    Konsekuensinya lantai hanya ditanyakan sebagai pertanyaan
 *    pertama bila luas sudah diberikan di awal; sesudah luas dijawab
 *    di dalam intake, lantai dilewati oleh aturan non-kritis — lihat
 *    worker-c-proposed-patch.md (butuh keputusan koordinator +
 *    kunci kuesioner `building-floors`).
 *  - Pertanyaan clear-height gudang terpisah TIDAK ditambahkan
 *    (pin §8: intake TIDAK PUNYA pertanyaan clearSpan/height);
 *    clear height tetap ditangkap lewat prompt sistem yang
 *    menggabungkan sistem + clear height.
 *    AMANDEMEN 2026-11-26 (owner requirement — mockup Step 3 di-ACC:
 *    "tanyakan ... clear height untuk gudang", Gap C): prompt gabungan
 *    itu kini JUGA diajukan di alur bare-chip (luas dijawab di dalam
 *    intake) — warehouse-system dikecualikan dari aturan §7
 *    non-kritis-hanya-sebagai-pertanyaan-pertama di selectNextQuestion.
 *    TIDAK ADA pertanyaan clear-height terpisah yang ditambahkan
 *    (pin §8 di atas tetap berlaku); cek §4 di bawah tidak berubah.
 *
 * Jalankan: npx --yes tsx src/test/aiWorkflowSprintClarify.test.ts
 * (skrip asersi tsx polos — BUKAN vitest.)
 */
import {
  extractUniversalContext, selectNextQuestion,
} from '../ai-tools/ezrab-ai/universalIntake';
import {
  universalIntakeGate, tryContinueUniversalContext, clearUniversalContext,
  projectIntakeGate, tryContinueProjectContext, getProjectContextState,
  getUniversalContextState, clearProjectContext,
} from '../ai-tools/ezrab-ai/actionRegistry';
import {
  extractProjectContext, detectFacilities, landscapeConceptById,
} from '../ai-tools/ezrab-ai/projectIntake';
import { selectQuestionnaireQuestions } from '../ai-tools/ezrab-ai/questionnaire';

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; failures.push(name); console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

const ctxOf = (text: string) => extractUniversalContext(text);
const qKey = (text: string) => selectNextQuestion(ctxOf(text))?.key ?? null;
const qPrompt = (text: string) => selectNextQuestion(ctxOf(text))?.prompt(ctxOf(text)) ?? '';
const qCrit = (text: string) => selectNextQuestion(ctxOf(text))?.critical ?? null;

/* ------------------------------------------------------------------ */
/* 1 — Jembatan: bentang ≠ panjang (celah Worker B §7/7.2)            */
/* ------------------------------------------------------------------ */
console.log('== 1 — Jembatan: bentang bukan panjang ==');
{
  // 1.1 Panjang saja → bentang tetap ditanya (dulu: lebar ditanya,
  //     bentang dianggap terjawab) + tercatat kritis-hilang.
  const b2 = ctxOf('buatkan rab jembatan beton panjang 20 m');
  check('1.1 panjang 20 m → pertanyaan bentang (bukan lebar)', qKey('buatkan rab jembatan beton panjang 20 m') === 'bridge-span', qKey('buatkan rab jembatan beton panjang 20 m'));
  check('1.2 panjang 20 m → span tetap null', b2.spanM == null, `span=${b2.spanM}`);
  check('1.3 panjang 20 m → length 20 tercatat', b2.lengthM === 20, `length=${b2.lengthM}`);
  check('1.4 panjang 20 m → missingCritical memuat bentang', b2.missingCritical.includes('bentang jembatan'), b2.missingCritical.join('; '));
  // 1.5 Panjang + lebar, tanpa bentang → bentang tetap pertama.
  check('1.5 panjang+lebar tanpa bentang → bentang dulu', qKey('buatkan rab jembatan panjang 20 m lebar 7 m') === 'bridge-span', qKey('buatkan rab jembatan panjang 20 m lebar 7 m'));
  // 1.6 Bentang disebut → panjang TIDAK dikarang dari bentang.
  const b3 = ctxOf('buatkan rab jembatan bentang 12 m');
  check('1.6 bentang 12 m → span 12', b3.spanM === 12, `span=${b3.spanM}`);
  check('1.7 bentang 12 m → length tetap null (bukan 12)', b3.lengthM == null, `length=${b3.lengthM}`);
  check('1.8 bentang 12 m → pertanyaan berikutnya lebar', qKey('buatkan rab jembatan bentang 12 m') === 'bridge-width', qKey('buatkan rab jembatan bentang 12 m'));
  // 1.9 Bentang + lebar → tipe konstruksi.
  check('1.9 bentang+lebar → tipe konstruksi', qKey('buatkan rab jembatan bentang 12 m lebar 7 m') === 'bridge-type', qKey('buatkan rab jembatan bentang 12 m lebar 7 m'));
  // 1.10 Prompt membedakan bentang dari panjang total.
  check('1.10 prompt bentang menyebut "bukan panjang totalnya"', qPrompt('buatkan rab jembatan beton').includes('bukan panjang totalnya'), qPrompt('buatkan rab jembatan beton'));
  // 1.11 Bare jembatan → bentang kritis pertama.
  check('1.11 jembatan tanpa ukuran → bentang kritis', qKey('buatkan rab jembatan beton') === 'bridge-span' && qCrit('buatkan rab jembatan beton') === true, qKey('buatkan rab jembatan beton'));
  // 1.12 Jalur cepat gerbang tetap melepas panjang-saja (needs-spec
  //     builder yang menanyakan bentang — pin §12.5/1.3).
  check('1.12 gate melepas jembatan panjang-saja (null)', universalIntakeGate('buatkan rab jembatan beton panjang 20 m') === null);
  clearUniversalContext();

  // 1.13 Replika alur Worker B §7: bentang tak dijawab → seksi hilang
  //      di review HARUS menyebut bentang.
  clearUniversalContext();
  universalIntakeGate('buatkan rab jembatan beton');
  tryContinueUniversalContext('panjang 20 m');
  tryContinueUniversalContext('lebar 7 m');
  const review = tryContinueUniversalContext('itu aja');
  const missingSection = (review?.message ?? '').split('Info yang masih hilang')[1]?.split('Cakupan katalog')[0] ?? '';
  check('1.13 review tampil', (review?.message ?? '').includes('Brief proyek'));
  check('1.14 seksi hilang menyebut bentang', /bentang/i.test(missingSection), missingSection.slice(0, 300));
  check('1.15 review tetap memuat panjang 20 m', (review?.message ?? '').includes('Panjang pekerjaan: 20 m'));
  check('1.16 review tetap memuat lebar 7 m', (review?.message ?? '').includes('Lebar: 7 m'));
  // 1.17 Pin tanya-tidak-ulang (Worker B 1.11): sesudah "panjang 20 m",
  //      giliran berikut menanyakan hal BARU (lebar kuesioner), bukan
  //      mengulang bentang.
  clearUniversalContext();
  universalIntakeGate('buatkan rab jembatan beton');
  const t2 = tryContinueUniversalContext('panjang 20 m');
  check('1.17 sesudah panjang: bukan ulang bentang', !(t2?.message ?? '').includes('Berapa **bentang'), (t2?.message ?? '').slice(0, 160));
  check('1.18 sesudah panjang: pertanyaan baru (lebar)', (t2?.message ?? '').includes('lebar jembatan'), (t2?.message ?? '').slice(0, 160));
  clearUniversalContext();
}

/* ------------------------------------------------------------------ */
/* 2 — Penjaga salin-panjang (lebar/bentang ≠ panjang)                 */
/* ------------------------------------------------------------------ */
console.log('== 2 — Penjaga salin-panjang ==');
{
  const roadW = ctxOf('buatkan rab jalan lebar 6 m');
  check('2.1 "lebar 6 m" → length tetap null', roadW.lengthM == null, `length=${roadW.lengthM}`);
  check('2.2 "lebar 6 m" → width 6', roadW.widthM === 6, `width=${roadW.widthM}`);
  check('2.3 "lebar 6 m" → pertanyaan panjang jalan', qKey('buatkan rab jalan lebar 6 m') === 'road-length', qKey('buatkan rab jalan lebar 6 m'));
  check('2.4 "jalan 2 km" → length 2000', ctxOf('buatkan rab jalan 2 km').lengthM === 2000);
  check('2.5 "drainase 500 m" → length 500 (angka telanjang diterima)', ctxOf('buatkan rab drainase 500 m').lengthM === 500);
  check('2.6 "panjang 20 m" eksplisit → length 20', ctxOf('buatkan rab jembatan beton panjang 20 m').lengthM === 20);
  const both = ctxOf('buatkan rab jembatan bentang 12 m panjang total 30 m');
  check('2.7 bentang 12 + panjang total 30 → span 12', both.spanM === 12, `span=${both.spanM}`);
  check('2.8 bentang 12 + panjang total 30 → length 30', both.lengthM === 30, `length=${both.lengthM}`);
  // 2.9 Invarian Worker B 2.2 (bentuk kata-kategori): bentang susulan
  //     tidak menimpa panjang yang sudah tercatat.
  const base = ctxOf('buatkan rab jembatan panjang 20 m');
  const merged = extractUniversalContext('jembatan bentang 12 m', base);
  check('2.9 bentang susulan → panjang tetap 20', merged.lengthM === 20, `length=${merged.lengthM}`);
  check('2.10 bentang susulan → span 12', merged.spanM === 12, `span=${merged.spanM}`);
}

/* ------------------------------------------------------------------ */
/* 3 — Retaining wall: panjang dulu (pin), tinggi menyusul             */
/* ------------------------------------------------------------------ */
console.log('== 3 — Retaining wall: panjang dulu ==');
{
  check('3.1 tanpa ukuran → panjang dulu (pin chatUniversalIntake)', qKey('buatkan rab retaining wall') === 'retaining-length', qKey('buatkan rab retaining wall'));
  check('3.2 panjang dulu → kritis', qCrit('buatkan rab retaining wall') === true, String(qCrit('buatkan rab retaining wall')));
  check('3.3 tinggi disebut → panjang ditanya', qKey('buatkan rab retaining wall tinggi 3 m') === 'retaining-length', qKey('buatkan rab retaining wall tinggi 3 m'));
  check('3.4 panjang saja → tinggi ditanya (pertanyaan pertama)', qKey('buatkan rab retaining wall panjang 100 m') === 'retaining-height', qKey('buatkan rab retaining wall panjang 100 m'));
  check('3.5 panjang saja → missingCritical kosong (jalur cepat utuh)', ctxOf('buatkan rab retaining wall panjang 100 m').missingCritical.length === 0, ctxOf('buatkan rab retaining wall panjang 100 m').missingCritical.join('; '));
  // 3.6 Multi-giliran: panjang → brief (tinggi non-kritis dilewati
  //     sesudah satu jawaban — aturan pin §8).
  clearUniversalContext();
  const t1 = universalIntakeGate('buatkan rab retaining wall');
  check('3.6 T1 menanyakan panjang', (t1?.message ?? '').includes('panjang dinding penahan'), (t1?.message ?? '').slice(0, 160));
  const t2 = tryContinueUniversalContext('panjang 100 m');
  check('3.7 T2 sampai brief', (t2?.message ?? '').includes('Brief proyek'), (t2?.message ?? '').slice(0, 160));
  check('3.8 T2 panjang 100 tercatat', getUniversalContextState()?.lengthM === 100, `dapat ${getUniversalContextState()?.lengthM}`);
  clearUniversalContext();
}

/* ------------------------------------------------------------------ */
/* 4 — Gudang: dimensi dulu, baru sistem struktur                      */
/* ------------------------------------------------------------------ */
console.log('== 4 — Gudang: dimensi dulu ==');
{
  check('4.1 gudang tanpa dimensi → luas dulu', qKey('buatkan rab gudang') === 'building-area', qKey('buatkan rab gudang'));
  check('4.2 gudang + luas → sistem struktur', qKey('buatkan rab gudang 500 m2') === 'warehouse-system', qKey('buatkan rab gudang 500 m2'));
  check('4.3 gudang + luas + lantai → sistem struktur', qKey('buatkan rab gudang 500 m2 1 lantai') === 'warehouse-system', qKey('buatkan rab gudang 500 m2 1 lantai'));
  check('4.4 prompt sistem tetap menyebut clear height', qPrompt('buatkan rab gudang 500 m2').includes('clear height'), qPrompt('buatkan rab gudang 500 m2'));
  // 4.5 Pin §8: sesudah sistem + lantai terjawab, tidak ada pertanyaan
  //     clearSpan/height lanjutan.
  const gd = ctxOf('gudang 10 x 20 m');
  gd.answers['warehouse-system'] = 'wh-portal';
  gd.floors = 1;
  gd.askedKeys = ['warehouse-system', 'building-floors'];
  check('4.5 pin §8: gudang lengkap → null', selectNextQuestion(gd) === null, selectNextQuestion(gd)?.key);
  // 4.6 Jalur cepat utuh: gudang + luas saja tidak masuk intake.
  check('4.6 gudang 1000 m2 → missingCritical kosong', ctxOf('buatkan rab gudang 1000 m2').missingCritical.length === 0);
  check('4.7 gate melepas gudang 1000 m2 (null)', universalIntakeGate('buatkan rab gudang 1000 m2') === null);
  clearUniversalContext();
  // 4.8 Multi-giliran: T1 luas (bukan sistem).
  clearUniversalContext();
  const t1 = universalIntakeGate('buatkan rab gudang');
  check('4.8 T1 menanyakan luas bangunan', (t1?.message ?? '').includes('luas bangunan total'), (t1?.message ?? '').slice(0, 160));
  clearUniversalContext();
}

/* ------------------------------------------------------------------ */
/* 5 — Drainase: tipe → panjang → dimensi penampang                   */
/* ------------------------------------------------------------------ */
console.log('== 5 — Drainase: panjang saluran ditanyakan ==');
{
  check('5.1 tanpa info → tipe dulu (kritis)', qKey('buatkan rab drainase') === 'drainage-type', qKey('buatkan rab drainase'));
  check('5.2 tanpa info → missing memuat tipe + panjang', ctxOf('buatkan rab drainase').missingCritical.includes('tipe saluran drainase') && ctxOf('buatkan rab drainase').missingCritical.includes('panjang saluran drainase'), ctxOf('buatkan rab drainase').missingCritical.join('; '));
  check('5.3 tipe dikenal tanpa panjang → panjang ditanya', qKey('buatkan rab drainase u-ditch') === 'drainage-length', qKey('buatkan rab drainase u-ditch'));
  check('5.4 panjang 500 m tanpa tipe → tipe dulu', qKey('buatkan rab drainase 500 m') === 'drainage-type', qKey('buatkan rab drainase 500 m'));
  // 5.5 Pin §8: konteks pin (500 m + tipe) → dimensi penampang dulu.
  const dr = ctxOf('drainase 500 m');
  dr.drainageType = 'U-ditch pracetak';
  check('5.5 pin §8: 500 m + tipe → drainage-dims dulu', selectNextQuestion(dr)?.key === 'drainage-dims', selectNextQuestion(dr)?.key);
  dr.askedKeys = ['drainage-type'];
  check('5.6 pin §8: sesudah satu jawaban → null', selectNextQuestion(dr) === null, selectNextQuestion(dr)?.key);
  // 5.7 Pembuangan ditangani kuesioner (bukan percakapan): kunci flow ada.
  const qk = selectQuestionnaireQuestions(ctxOf('buatkan rab drainase u-ditch 500 m')).map((q) => q.key);
  check('5.7 kuesioner drainase memuat aliran/pembuangan', qk.includes('drainage-flow'), qk.join(', '));
}

/* ------------------------------------------------------------------ */
/* 6 — Bangunan: luas → lantai; jawaban tak diulang                    */
/* ------------------------------------------------------------------ */
console.log('== 6 — Bangunan ==');
{
  check('6.1 kantor 3 lantai → luas ditanya', qKey('buatkan rab gedung kantor 3 lantai') === 'building-area', qKey('buatkan rab gedung kantor 3 lantai'));
  check('6.2 kantor + luas → lantai ditanya', qKey('buatkan rab gedung kantor luas 500 m2') === 'building-floors', qKey('buatkan rab gedung kantor luas 500 m2'));
  check('6.3 kantor tanpa info → luas kritis', qKey('buatkan rab gedung kantor') === 'building-area' && qCrit('buatkan rab gedung kantor') === true, qKey('buatkan rab gedung kantor'));
  // 6.4 Jawaban tidak diulang: luas dijawab → giliran berikut TIDAK
  //     menanyakan luas lagi; luas tercatat.
  clearUniversalContext();
  universalIntakeGate('buatkan rab gedung kantor');
  const t2 = tryContinueUniversalContext('luas bangunan 500 m2');
  check('6.4 luas dijawab → tidak ditanya ulang', !(t2?.message ?? '').includes('Berapa perkiraan **luas bangunan total**'), (t2?.message ?? '').slice(0, 200));
  check('6.5 luas 500 tercatat di state', getUniversalContextState()?.buildingAreaM2 === 500, `dapat ${getUniversalContextState()?.buildingAreaM2}`);
  clearUniversalContext();
  // 6.6 Spesifikasi bangunan ditangani kuesioner sesudah percakapan:
  //     pondasi + atap + finishing + MEP.
  const qk = selectQuestionnaireQuestions(ctxOf('buatkan rab gedung kantor luas 500 m2 3 lantai')).map((q) => q.key);
  check('6.6 kuesioner bangunan memuat pondasi', qk.includes('building-foundation'), qk.join(', '));
  check('6.7 kuesioner bangunan memuat tipe atap', qk.includes('building-roof-type'), qk.join(', '));
  check('6.8 kuesioner bangunan memuat finishing + MEP', qk.includes('building-finish-grade') && qk.includes('building-mep-scope'), qk.join(', '));
}

/* ------------------------------------------------------------------ */
/* 7 — Jalan: panjang → lebar; perkerasan via subtipe                 */
/* ------------------------------------------------------------------ */
console.log('== 7 — Jalan ==');
{
  check('7.1 tanpa ukuran → panjang dulu (kritis)', qKey('buatkan rab jalan') === 'road-length', qKey('buatkan rab jalan'));
  check('7.2 panjang 2 km → lebar ditanya', qKey('buatkan rab jalan 2 km') === 'road-width', qKey('buatkan rab jalan 2 km'));
  check('7.3 lebar saja → panjang ditanya (bukan kondisi)', qKey('buatkan rab jalan lebar 6 m') === 'road-length', qKey('buatkan rab jalan lebar 6 m'));
  check('7.4 panjang+lebar → kondisi (non-kritis)', qKey('buatkan rab jalan panjang 2 km lebar 6 m') === 'road-condition', qKey('buatkan rab jalan panjang 2 km lebar 6 m'));
}

/* ------------------------------------------------------------------ */
/* 8 — MEP: basis ukuran per subsistem (pin, tanpa perubahan)          */
/* ------------------------------------------------------------------ */
console.log('== 8 — MEP (pin) ==');
{
  check('8.1 listrik tanpa ukuran → daya (kritis, bukan luas)', qKey('buatkan rab instalasi listrik rumah 3 kamar tidur') === 'mep-power-capacity' && qCrit('buatkan rab instalasi listrik rumah 3 kamar tidur') === true, qKey('buatkan rab instalasi listrik rumah 3 kamar tidur'));
  check('8.2 listrik 100 kva → lantai (non-kritis)', qKey('buatkan rab instalasi listrik 100 kva') === 'mep-floors', qKey('buatkan rab instalasi listrik 100 kva'));
  check('8.3 plumbing → lantai (kritis)', qKey('buatkan rab instalasi plumbing apartemen') === 'mep-floors', qKey('buatkan rab instalasi plumbing apartemen'));
  check('8.4 HVAC → luas (kritis)', qKey('buatkan rab instalasi AC gedung kantor') === 'mep-area', qKey('buatkan rab instalasi AC gedung kantor'));
}

/* ------------------------------------------------------------------ */
/* 9 — Renovasi: lingkup dulu                                         */
/* ------------------------------------------------------------------ */
console.log('== 9 — Renovasi ==');
{
  check('9.1 renovasi 2 lantai → lingkup ditanya', qKey('renovasi rumah 2 lantai') === 'renovation-scope', qKey('renovasi rumah 2 lantai'));
  check('9.2 dapur+KM disebut → luas area ditanya', qKey('renovasi dapur dan kamar mandi') === 'renovation-area', qKey('renovasi dapur dan kamar mandi'));
  // 9.3 Kondisi eksisting ditangani kuesioner.
  const qk = selectQuestionnaireQuestions(ctxOf('renovasi dapur dan kamar mandi')).map((q) => q.key);
  check('9.3 kuesioner renovasi memuat kondisi', qk.includes('renovation-condition'), qk.join(', '));
}

/* ------------------------------------------------------------------ */
/* 10 — Landscape: irigasi + hardscape tercatat sebagai fasilitas     */
/* ------------------------------------------------------------------ */
console.log('== 10 — Landscape: irigasi + hardscape ==');
{
  check('10.1 "sistem irigasi" terdeteksi (taman publik)', detectFacilities('sistem irigasi', 'taman-publik').some((f) => f.id === 'irrigation'), detectFacilities('sistem irigasi', 'taman-publik').map((f) => f.id).join(', '));
  check('10.2 "hardscape" terdeteksi (taman publik)', detectFacilities('dengan hardscape', 'taman-publik').some((f) => f.id === 'hardscape'), detectFacilities('dengan hardscape', 'taman-publik').map((f) => f.id).join(', '));
  check('10.3 saran taman publik memuat irigasi', (landscapeConceptById('taman-publik')?.facilities ?? []).some((f) => f.id === 'irrigation'));
  check('10.4 saran taman publik memuat hardscape', (landscapeConceptById('taman-publik')?.facilities ?? []).some((f) => f.id === 'hardscape'));
  check('10.5 saran resort memuat irigasi', (landscapeConceptById('landscape-resort')?.facilities ?? []).some((f) => f.id === 'irrigation'));
  check('10.6 saran RTH memuat irigasi', (landscapeConceptById('ruang-terbuka-hijau')?.facilities ?? []).some((f) => f.id === 'irrigation'));
  // 10.7 Jawaban fasilitas yang menyebut irigasi tidak hilang meski
  //      katanya cocok pola kategori lain (INFRASTRUCTURE).
  const base = extractProjectContext('buatkan rab landscape 1 hektar');
  const withConcept = extractProjectContext('taman kota', base);
  const answered = extractProjectContext('jogging track, playground, dan sistem irigasi', withConcept);
  check('10.7 fasilitas tercatat (jogging+playground+irigasi)', ['jogging-track', 'playground', 'irrigation'].every((id) => answered.facilities.includes(id)), answered.facilities.join(', '));
  check('10.8 konsep taman publik bertahan', answered.conceptId === 'taman-publik', answered.conceptId);
  // 10.9 Multi-giliran lewat gerbang: konsep → fasilitas (irigasi
  //      diakui) → kondisi lahan → pratinjau.
  clearProjectContext();
  const g1 = projectIntakeGate('buatkan rab landscape 1 hektar');
  check('10.9 T1 menanyakan konsep', (g1?.message ?? '').includes('Landscape seperti apa'), (g1?.message ?? '').slice(0, 160));
  const g2 = tryContinueProjectContext('taman kota');
  check('10.10 T2 menanyakan fasilitas', (g2?.message ?? '').includes('Fasilitas apa saja'), (g2?.message ?? '').slice(0, 160));
  const g3 = tryContinueProjectContext('jogging track, playground, dan sistem irigasi');
  check('10.11 T3 fasilitas tercatat di state', ['jogging-track', 'playground', 'irrigation'].every((id) => (getProjectContextState()?.facilities ?? []).includes(id)), JSON.stringify(getProjectContextState()?.facilities));
  check('10.12 T3 menggema irigasi', (g3?.message ?? '').includes('Sistem irigasi / penyiraman'), (g3?.message ?? '').slice(0, 240));
  const g4 = tryContinueProjectContext('lahan datar');
  check('10.13 T4 sampai pratinjau', (g4?.message ?? '').includes('Pratinjau RAB'), (g4?.message ?? '').slice(0, 160));
  clearProjectContext();
}

console.log(`\n${failed === 0 ? 'SEMUA TES KLARIFIKASI WORKER C LULUS' : 'ADA TES GAGAL'} — lulus ${passed}, gagal ${failed}`);
if (failures.length) console.log('Gagal:', failures.join(' | '));
process.exit(failed === 0 ? 0 : 1);

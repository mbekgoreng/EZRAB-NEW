/**
 * EZRAB AI — WORKFLOW SPRINT INTENT COVERAGE (Worker A, 2026-11-26).
 *
 * Cakupan intent konstruksi lintas 10 kategori (directive §3A):
 *  1. bangunan hunian/komersial, 2. struktur, 3. jalan & jembatan,
 *  4. landscape & site development, 5. drainase & irigasi,
 *  6. dinding penahan & pekerjaan tanah, 7. MEP, 8. renovasi,
 *  9. gudang & industri, 10. pekerjaan khusus.
 *
 * Metode: probe lewat entry point NYATA (routeIntent + classifyUniversal
 * + evaluateRabIntent + executeIntent, mock ctx seperti
 * rabIntentFirstFlow.test.ts). Substantif = balasan menggema fakta /
 * bertanya SATU hal kontekstual / membangun draft — BUKAN menu generik
 * 4 jalur ("RAB-nya untuk apa? Pilih jalurnya:") dan BUKAN UNKNOWN.
 *
 * Perbaikan yang dipin di sini (file milik Worker A):
 *  - intentRouter: bengkel/workshop, masjid/musholla/gereja, galian/
 *    urugan/timbunan/pekerjaan tanah/cut and fill, sumur bor, SPBU
 *    kini rute CREATE_RAB_SUMMARY (dulu CLARIFY); niat tanpa kata
 *    "rab" ("rencana bangun ruko ...", "hitungkan biaya bangun jalan
 *    ...") kini rute SUMMARY (dulu UNKNOWN ke AI).
 *  - rabIntentSpec + projectIntake: kata generik tempat ("di desa",
 *    "di kampung halaman saya", "di pinggir jalan raya") TIDAK lagi
 *    dicatat sebagai lokasi ("Desa"/"Kampung"/"Pinggir Jalan Raya").
 *
 * Pin yang dijaga (bukan diubah): "panjang" jembatan TIDAK PERNAH
 * dibaca sebagai "bentang" — jembatan tanpa bentang WAJIB needs-spec.
 *
 * Jalankan: NODE_OPTIONS=--max-old-space-size=1536 npx --yes tsx src/test/aiWorkflowSprintIntent.test.ts
 * (skrip asersi tsx polos — BUKAN vitest.)
 */
import { routeIntent } from '../ai-tools/ezrab-ai/intentRouter';
import { classifyUniversal } from '../ai-tools/ezrab-ai/universalIntake';
import { evaluateRabIntent, clearLastRabIntentSpec } from '../ai-tools/ezrab-ai/rabIntentFlow';
import { executeIntent } from '../ai-tools/ezrab-ai/actionRegistry';
import { extractRabIntentSpec } from '../ai-tools/ezrab-ai/rabIntentSpec';
import { extractProjectContext } from '../ai-tools/ezrab-ai/projectIntake';

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

/** Penanda balasan generik / tidak dikenali (bukan jawaban substantif). */
const GENERIC_MARKERS = [
  'Pilih cara membuat RAB',
  'RAB-nya untuk apa? Pilih jalurnya:',
  'Perintah tidak dikenali',
];
const isGeneric = (msg: string) => GENERIC_MARKERS.some((m) => msg.includes(m));

/** Eksekusi sekali lewat intent hasil routing; kembalikan pesannya. */
function execRouted(text: string): { ok: boolean; message: string } {
  clearLastRabIntentSpec();
  const routed = routeIntent(text);
  if (!routed.intent.startsWith('CREATE_RAB')) return { ok: false, message: `(routed ${routed.intent})` };
  const res = executeIntent(routed.intent as never, undefined, ctxFor(text));
  return { ok: res.ok === true, message: res.message ?? '' };
}

/* ------------------------------------------------------------------ */
/* 1 — Routing: kategori yang dulu jatuh CLARIFY → SUMMARY             */
/* ------------------------------------------------------------------ */
console.log('== 1 — Routing bengkel / ibadah / galian / sumur bor / SPBU ==');
{
  const routedSummary = [
    'buatkan rab workshop bengkel 15x25 m',
    'buatkan rab bengkel las 10x20 m',
    'buatkan rab masjid 2 lantai luas bangunan 400 m2',
    'buatkan rab galian tanah 100 m3',
    'buatkan rab pekerjaan tanah galian dan urugan volume 500 m3',
    'buatkan rab cut and fill lahan 2000 m2',
    'buatkan rab sumur bor kedalaman 40 m',
    'buatkan rab SPBU 1 lantai',
  ];
  for (const text of routedSummary) {
    check(`1 route SUMMARY: "${text.slice(0, 48)}"`, routeIntent(text).intent === 'CREATE_RAB_SUMMARY',
      `dapat ${routeIntent(text).intent}`);
  }
  // Sumur bor & masjid: SUMMARY membangun draft / bertanya kontekstual,
  // bukan menu generik 4 jalur (perilaku lama lewat CLARIFY).
  const bor = execRouted('buatkan rab sumur bor kedalaman 40 m');
  check('1.9 sumur bor: eksekusi ok + bukan menu generik', bor.ok && !isGeneric(bor.message), bor.message.slice(0, 120));
  check('1.10 sumur bor: menggema kedalaman 40 m', bor.message.includes('40 m'), bor.message.slice(0, 200));
  const masjid = execRouted('buatkan rab masjid 2 lantai luas bangunan 400 m2');
  check('1.11 masjid: eksekusi ok + bukan menu generik', masjid.ok && !isGeneric(masjid.message), masjid.message.slice(0, 120));
  check('1.12 masjid: menggema luas 400 m²', masjid.message.includes('400 m'), masjid.message.slice(0, 200));
  // SPBU: klasifikasi taksonomi belum ada (celah terbuka, lihat laporan)
  // — routing SUMMARY memberi jawaban jujur "belum bisa mengenali",
  // bukan menu generik; dukung penuh butuh entri taksonomi.
  const spbu = execRouted('buatkan rab SPBU 1 lantai');
  check('1.13 SPBU: bukan menu generik 4 jalur', !isGeneric(spbu.message), spbu.message.slice(0, 120));
}

/* ------------------------------------------------------------------ */
/* 2 — Niat tanpa kata "rab"                                           */
/* ------------------------------------------------------------------ */
console.log('== 2 — Niat bangun/estimasi tanpa kata "rab" ==');
{
  check('2.1 rencana bangun ruko → SUMMARY',
    routeIntent('rencana bangun ruko 3 lantai budget 1,5 miliar di Sidoarjo').intent === 'CREATE_RAB_SUMMARY');
  check('2.2 hitungkan biaya bangun jalan → SUMMARY',
    routeIntent('tolong hitungkan biaya bangun jalan desa 1 km').intent === 'CREATE_RAB_SUMMARY');
  check('2.3 mau bangun rumah (pin lama) → SUMMARY',
    routeIntent('mau bangun rumah 2 lantai 120 m2 budget 900 juta').intent === 'CREATE_RAB_SUMMARY');
  check('2.4 hitung estimasi bangun gudang (pin lama) → SUMMARY',
    routeIntent('hitung estimasi bangun gudang 500 m2').intent === 'CREATE_RAB_SUMMARY');
  const rencana = execRouted('rencana bangun ruko 3 lantai budget 1,5 miliar di Sidoarjo');
  check('2.5 rencana ruko: eksekusi substantif', rencana.ok && !isGeneric(rencana.message), rencana.message.slice(0, 120));
  check('2.6 rencana ruko: menggema Sidoarjo + 3 lantai',
    rencana.message.includes('Sidoarjo') && rencana.message.includes('3 lantai'), rencana.message.slice(0, 300));
}

/* ------------------------------------------------------------------ */
/* 3 — Pin jembatan: panjang TIDAK PERNAH = bentang                    */
/* ------------------------------------------------------------------ */
console.log('== 3 — Pin jembatan: panjang ≠ bentang ==');
{
  const spanOnly = extractRabIntentSpec('buatkan rab jembatan beton bentang 10 m panjang 30 m lebar 5 m');
  check('3.1 bentang 10 m terbaca sebagai span', spanOnly.universal?.spanM === 10, `dapat ${spanOnly.universal?.spanM}`);
  const noSpan = extractRabIntentSpec('buatkan rab jembatan panjang 30 m lebar 5 m');
  check('3.2 panjang 30 m TIDAK dibaca sebagai span', noSpan.universal?.spanM == null, `dapat ${noSpan.universal?.spanM}`);
  check('3.3 jembatan tanpa bentang → rute custom (needs-spec)',
    evaluateRabIntent('buatkan rab jembatan panjang 30 m lebar 5 m').route === 'custom');
  const needSpan = execRouted('buatkan rab jembatan panjang 30 m lebar 5 m');
  check('3.4 jembatan tanpa bentang: minta bentang, bukan draft diam-diam',
    needSpan.ok && needSpan.message.includes('bentang'), needSpan.message.slice(0, 200));
  const bare = execRouted('buatkan rab jembatan');
  check('3.5 jembatan telanjang: bertanya bentang', bare.ok && bare.message.includes('bentang'), bare.message.slice(0, 200));
  const full = execRouted('buatkan rab jembatan beton bentang 10 m panjang 30 m lebar 5 m');
  check('3.6 jembatan berbentang: draft dibangun + menggema bentang 10 m',
    full.ok && full.message.includes('bentang 10 m'), full.message.slice(0, 300));
}

/* ------------------------------------------------------------------ */
/* 4 — Lokasi: kata generik tempat bukan nama lokasi                   */
/* ------------------------------------------------------------------ */
console.log('== 4 — Lokasi generik ditolak ==');
{
  check('4.1 "di desa" → lokasi null (bukan "Desa")',
    extractRabIntentSpec('buatkan rab jembatan kayu bentang 8 m di desa').location === null,
    `dapat ${extractRabIntentSpec('buatkan rab jembatan kayu bentang 8 m di desa').location}`);
  check('4.2 "di kampung halaman saya" → lokasi null (bukan "Kampung")',
    extractRabIntentSpec('buatkan rab rumah di kampung halaman saya').location === null,
    `dapat ${extractRabIntentSpec('buatkan rab rumah di kampung halaman saya').location}`);
  check('4.3 "di pinggir jalan raya" → lokasi spek null',
    extractRabIntentSpec('buatkan rab drainase di pinggir jalan raya').location === null,
    `dapat ${extractRabIntentSpec('buatkan rab drainase di pinggir jalan raya').location}`);
  check('4.4 "di pinggir jalan raya" → lokasi intake null',
    extractProjectContext('buatkan rab drainase di pinggir jalan raya').location === null,
    `dapat ${extractProjectContext('buatkan rab drainase di pinggir jalan raya').location}`);
  check('4.5 lokasi asli tetap terbaca: Malang',
    extractRabIntentSpec('buatkan rab rumah 2 lantai luas bangunan 120 m2 di Malang budget 800 juta').location === 'Malang');
  check('4.6 lokasi asli tetap terbaca: Sidoarjo',
    extractRabIntentSpec('buatkan rab rumah baru di Sidoarjo lahan 200 m2 bangunan 150 m2').location === 'Sidoarjo');
}

/* ------------------------------------------------------------------ */
/* 5 — Sepuluh kategori: routing + klasifikasi + balasan substantif    */
/* ------------------------------------------------------------------ */
console.log('== 5 — Sepuluh kategori: satu pesan per kategori ==');
{
  const perCategory: Array<[string, string, string]> = [
    ['1-bangunan', 'buatkan rab rumah 2 lantai luas bangunan 120 m2 di Malang budget 800 juta', 'rumah'],
    ['2-struktur', 'buatkan rab pondasi bore pile diameter 60 cm kedalaman 18 m 24 titik', 'pondasi'],
    ['3-jalan-jembatan', 'buatkan rab jalan aspal hotmix panjang 2 km lebar 6 m', 'jalan-aspal'],
    ['4-landscape', 'buatkan rab landscape taman kota 1 hektar di Surabaya', 'taman-kota'],
    ['5-drainase-irigasi', 'buatkan rab drainase lingkungan sepanjang 500 meter', 'drainase'],
    ['6-penahan-tanah', 'buatkan rab dinding penahan tanah sepanjang 50 m tinggi 3 m', 'dinding-penahan'],
    ['7-mep', 'buatkan rab instalasi listrik gedung kantor 3 lantai', 'listrik'],
    ['8-renovasi', 'buatkan rab renovasi rumah 2 lantai luas bangunan 90 m2', 'renovasi'],
    ['9-gudang-industri', 'buatkan rab gudang pendingin 800 m2 dinding sandwich panel', 'gudang-industri'],
    ['10-khusus', 'buatkan rab kandang ayam petelur kapasitas 5000 ekor', 'kandang'],
  ];
  for (const [cat, text, expectPrimary] of perCategory) {
    const routed = routeIntent(text);
    const cls = classifyUniversal(text);
    const exec = execRouted(text);
    check(`${cat}: rute CREATE_RAB_*`, routed.intent.startsWith('CREATE_RAB'), `dapat ${routed.intent}`);
    check(`${cat}: klasifikasi primer ${expectPrimary}`, cls.primary?.id === expectPrimary, `dapat ${cls.primary?.id ?? 'null'}`);
    check(`${cat}: balasan substantif (ok, bukan menu generik)`, exec.ok && !isGeneric(exec.message) && exec.message.length > 40,
      exec.message.slice(0, 120));
  }
}

/* ------------------------------------------------------------------ */
/* 6 — Kombinasi penuh: kategori + budget + dimensi + lantai + lahan  */
/*    + bangunan + struktur + konsep + lokasi + baru-vs-eksisting      */
/* ------------------------------------------------------------------ */
console.log('== 6 — Kombinasi penuh dalam satu pesan ==');
{
  const full = 'buatkan rab rumah baru 2 lantai konsep minimalis modern struktur beton bertulang atap dak beton di Sidoarjo lahan 200 m2 bangunan 150 m2 budget 1,2 miliar';
  const spec = extractRabIntentSpec(full);
  check('6.1 jenis rumah', spec.buildingType === 'rumah', `dapat ${spec.buildingType}`);
  check('6.2 kategori baru', spec.projectCategory === 'baru', `dapat ${spec.projectCategory}`);
  check('6.3 lantai 2', spec.floors === 2, `dapat ${spec.floors}`);
  check('6.4 lahan 200 m²', spec.landAreaM2 === 200, `dapat ${spec.landAreaM2}`);
  check('6.5 bangunan 150 m²', spec.buildingAreaM2 === 150, `dapat ${spec.buildingAreaM2}`);
  check('6.6 lokasi Sidoarjo', spec.location === 'Sidoarjo', `dapat ${spec.location}`);
  check('6.7 budget Rp1.200.000.000', spec.budgetIdr === 1_200_000_000, `dapat ${spec.budgetIdr}`);
  check('6.8 struktur beton bertulang terbaca', spec.structuralSystem.some((s) => s.toLowerCase().includes('beton bertulang')),
    `dapat ${JSON.stringify(spec.structuralSystem)}`);
  check('6.9 atap dak beton terbaca', spec.roofSystem.some((s) => s.toLowerCase().includes('dak beton')),
    `dapat ${JSON.stringify(spec.roofSystem)}`);
  const exec = execRouted(full);
  check('6.10 kombinasi penuh: draft dibangun + menggema 150 m²',
    exec.ok && exec.message.includes('150 m'), exec.message.slice(0, 200));
  // Renovasi atas bangunan eksisting (bukan baru) tetap dikenali.
  const reno = extractRabIntentSpec('buatkan rab renovasi rumah lama eksisting di Surabaya luas bangunan 90 m2');
  check('6.11 renovasi eksisting: kategori renovasi', reno.projectCategory === 'renovasi', `dapat ${reno.projectCategory}`);
  check('6.12 renovasi eksisting: lokasi Surabaya', reno.location === 'Surabaya', `dapat ${reno.location}`);
  check('6.13 renovasi eksisting: bangunan 90 m²', reno.buildingAreaM2 === 90, `dapat ${reno.buildingAreaM2}`);
}

console.log(`\n${failed === 0 ? 'SEMUA TES CAKUPAN INTENT SPRINT LULUS' : 'ADA TES GAGAL'} — lulus ${passed}, gagal ${failed}`);
if (failures.length) console.log('Gagal:', failures.join(' | '));
process.exit(failed === 0 ? 0 : 1);

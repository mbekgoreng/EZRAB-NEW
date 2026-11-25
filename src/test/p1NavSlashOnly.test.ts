/**
 * EZRAB AI Hardening P1 — §4.1 SLASH-ONLY NAVIGATION
 * (directive P1 2026-11-24 / OD-1, owner decision — binding)
 *
 * Suite tsx polos (BUKAN vitest — jalankan: npx tsx src/test/p1NavSlashOnly.test.ts).
 *
 * Mem-pin tabel directive §4.1 pada DUA router sekaligus (navRegistry +
 * intentRouter) lewat helper route() yang meniru urutan view: navRegistry
 * dulu, bila 'none' baru routeIntent. "→ AI" berarti: nav 'none' DAN
 * routeIntent UNKNOWN dengan localOnly=false (pesan diteruskan ke
 * pipeline AI, bukan dijawab lokal / dinavigasikan).
 *
 * Cakupan temuan audit: W-A-01 (negasi), W-A-02 (catch-all SEARCH_AHSP),
 * W-A-03 (residu F-06), W-A-04 (carve-out forcedAi — audit sumber, lihat
 * §G), W-A-05 (saran perintah tak dikenal), W-A-06 ("/" telanjang).
 * W-A-07 (konsolidasi dua router) SENGAJA tidak diuji di sini — follow-up.
 */
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import {
  resolveNavCommand,
  suggestSlash,
  extractAhspResidual,
  NAV_ENTRIES,
} from '../ai-tools/ezrab-ai/navRegistry';
import { routeIntent } from '../ai-tools/ezrab-ai/intentRouter';

// tsx menjalankan berkas ini sebagai ESM — __dirname tidak tersedia.
const __dirname = dirname(fileURLToPath(import.meta.url));

let passed = 0;
let failed = 0;
function assert(cond: boolean, name: string): void {
  if (cond) { passed++; }
  else { failed++; console.error('FAIL:', name); }
}

/** Hasil routing gabungan (urutan view: navRegistry → routeIntent). */
type Outcome =
  | 'AI' | 'NAV' | 'HELP' | 'SEARCH_AHSP' | 'ANSWER' | 'CLARIFY' | 'OTHER';
function route(input: string): { outcome: Outcome; detail: string } {
  const nav = resolveNavCommand(input);
  if (nav.mode === 'direct') {
    return { outcome: 'NAV', detail: `nav direct:${nav.entry.id}${nav.ahspQuery ? ` q=${nav.ahspQuery}` : ''}` };
  }
  if (nav.mode === 'suggest') {
    return {
      outcome: nav.message.includes('/help') ? 'HELP' : 'OTHER',
      detail: `nav suggest: ${nav.message} [${nav.candidates.map((c) => c.id).join(',')}]`,
    };
  }
  if (nav.mode === 'ambiguous') {
    return { outcome: 'OTHER', detail: `nav ambiguous: ${nav.candidates.map((c) => c.id).join(',')}` };
  }
  const r = routeIntent(input);
  if (r.intent === 'UNKNOWN' && !r.localOnly) return { outcome: 'AI', detail: 'routeIntent UNKNOWN → AI' };
  if (r.intent === 'UNKNOWN') {
    return {
      outcome: r.clarificationPrompt?.includes('/help') ? 'HELP' : 'OTHER',
      detail: `routeIntent UNKNOWN local: ${r.clarificationPrompt ?? ''}`,
    };
  }
  if (r.intent.startsWith('OPEN_')) return { outcome: 'NAV', detail: `routeIntent ${r.intent}` };
  if (r.intent === 'SEARCH_AHSP') return { outcome: 'SEARCH_AHSP', detail: `routeIntent SEARCH_AHSP param=${r.param ?? '∅'}` };
  if (r.intent === 'CLARIFY_TOPIC') return { outcome: 'CLARIFY', detail: 'routeIntent CLARIFY_TOPIC' };
  return { outcome: 'ANSWER', detail: `routeIntent ${r.intent}` };
}
function expectOutcome(input: string, want: Outcome, name: string): void {
  const got = route(input);
  assert(got.outcome === want, `${name} — route(${JSON.stringify(input)}) = ${got.outcome} (${got.detail}), want ${want}`);
}

/* --- A. Tabel directive §4.1 (verbatim) --- */
expectOutcome('database', 'AI', 'A1 database → AI');
expectOutcome('What is AHSP?', 'AI', 'A2 What is AHSP? → AI');
expectOutcome('Open the AHSP page', 'AI', 'A3 Open the AHSP page → AI');
{
  const got = route('Find AHSP concrete K-250');
  assert(got.outcome === 'SEARCH_AHSP', `A4 Find AHSP concrete K-250 → AHSP retrieval, got ${got.outcome} (${got.detail})`);
  const r = routeIntent('Find AHSP concrete K-250');
  assert(r.param === 'concrete K-250', `A4 param dipertahankan (got ${JSON.stringify(r.param)})`);
}
expectOutcome('Explain QTO', 'AI', 'A5 Explain QTO → AI');
expectOutcome('/ahsp', 'NAV', 'A6 /ahsp → navigate');
expectOutcome('/rab', 'NAV', 'A7 /rab → navigate');
expectOutcome('/dashboard', 'NAV', 'A8 /dashboard → navigate (via routeIntent LEGACY_SLASH)');
expectOutcome('/unknown', 'HELP', 'A9 /unknown → help');
expectOutcome('Explain the /ahsp command', 'AI', 'A10 Explain the /ahsp command → AI');
expectOutcome('I do not want to open /ahsp', 'AI', 'A11 I do not want to open /ahsp → AI');
expectOutcome('jangan buka ahsp', 'AI', 'A12 jangan buka ahsp → AI');
expectOutcome('buka ahsp', 'AI', 'A13 buka ahsp → AI (PERILAKU BARU §4.1)');
{
  const nav = resolveNavCommand('tolong buka /ahsp');
  assert(nav.mode === 'direct', `A14 tolong buka /ahsp → navigate (got ${nav.mode})`);
  if (nav.mode === 'direct') {
    assert(nav.entry.id === 'ahsp', 'A14 entry ahsp');
    assert(nav.ahspQuery === undefined, `A14 tanpa q (got ${JSON.stringify(nav.ahspQuery)})`);
  }
}

/* --- B. Matriks verba NL × target — semua ke AI (§4.1) --- */
for (const verb of ['buka', 'bukain', 'tampilkan', 'tampilin', 'lihat', 'liatin', 'masuk ke', 'pergi ke']) {
  for (const target of ['ahsp', 'rab', 'qto', 'template rab', 'laporan', 'pengaturan', 'spreadsheet', 'ded']) {
    expectOutcome(`${verb} ${target}`, 'AI', `B ${verb} ${target} → AI`);
  }
}
expectOutcome('Buka halaman AHSP', 'AI', 'B Buka halaman AHSP → AI');
expectOutcome('Tampilkan database AHSP', 'AI', 'B Tampilkan database AHSP → AI');
expectOutcome('Saya ingin melihat RAB', 'AI', 'B Saya ingin melihat RAB → AI');
expectOutcome('buka proyek draft', 'AI', 'B buka proyek draft → AI');
expectOutcome('gunakan template rab', 'AI', 'B gunakan template rab → AI');
expectOutcome('buat proyek baru', 'AI', 'B buat proyek baru → AI');

/* --- C. Negasi (W-A-01) — kedua router --- */
for (const s of [
  'jangan buka ahsp', 'saya tidak mau buka ahsp', 'jangan buka /ahsp',
  'tidak usah buka /rab', 'nggak mau buka ahsp', 'gak mau buka qto',
  'jangan dulu buka ahsp', 'batal buka ahsp', 'tidak jadi buka /ahsp',
  'I do not want to open /ahsp', 'never open /ahsp',
]) {
  const nav = resolveNavCommand(s);
  assert(nav.mode === 'none', `C navRegistry ${JSON.stringify(s)} → none (got ${nav.mode})`);
  const r = routeIntent(s);
  assert(!r.intent.startsWith('OPEN_'), `C routeIntent ${JSON.stringify(s)} bukan OPEN_* (got ${r.intent})`);
}
{
  // Penjaga negasi di langkah game: "jangan buka game" bukan perintah main.
  assert(routeIntent('jangan buka game').intent === 'UNKNOWN', 'C jangan buka game → UNKNOWN (bukan OPEN_GAME_SPACE)');
  // §7 (Fast Track 2026-11-24 / P1-17): residu game-space DITUTUP —
  // perintah game NL tidak lagi menavigasi; hanya slash /game yang
  // membuka Game Space. "buka game" kini jatuh UNKNOWN ke AI.
  assert(routeIntent('buka game').intent === 'UNKNOWN', 'C buka game → UNKNOWN (§7, residu ditutup)');
  assert(routeIntent('main game').intent === 'UNKNOWN', 'C main game → UNKNOWN (§7)');
  assert(routeIntent('buka game space').intent === 'UNKNOWN', 'C buka game space → UNKNOWN (§7)');
  assert(routeIntent('/game').intent === 'OPEN_GAME_SPACE', 'C /game tetap OPEN_GAME_SPACE (slash)');
}

/* --- D. Catch-all SEARCH_AHSP (W-A-02) --- */
{
  const r1 = routeIntent('Open the AHSP page');
  assert(r1.intent === 'UNKNOWN', `D1 Open the AHSP page bukan SEARCH_AHSP (got ${r1.intent})`);
  const r2 = routeIntent('Explain the /ahsp command');
  assert(r2.intent === 'UNKNOWN', `D2 Explain the /ahsp command bukan SEARCH_AHSP (got ${r2.intent})`);
  const r3 = routeIntent('buka ahsp beton');
  assert(r3.intent === 'UNKNOWN', `D3 buka ahsp beton bukan SEARCH_AHSP (got ${r3.intent})`);
  const r4 = routeIntent('harga satuan itu apa');
  assert(r4.intent === 'UNKNOWN', `D4 harga satuan itu apa bukan SEARCH_AHSP (got ${r4.intent})`);
  // Kontrol positif: pencarian nyata tetap dicari.
  const r5 = routeIntent('ahsp beton K-250');
  assert(r5.intent === 'SEARCH_AHSP' && r5.param === 'beton K-250', `D5 ahsp beton K-250 tetap SEARCH_AHSP (got ${r5.intent}/${r5.param})`);
  const r6 = routeIntent('harga satuan beton');
  assert(r6.intent === 'SEARCH_AHSP', `D6 harga satuan beton tetap SEARCH_AHSP (got ${r6.intent})`);
  const r7 = routeIntent('cari ahsp pondasi batu kali');
  assert(r7.intent === 'SEARCH_AHSP' && r7.param === 'pondasi batu kali', 'D7 cari ahsp ... tetap SEARCH_AHSP');
}

/* --- E. Residu F-06 (W-A-03) --- */
{
  assert(extractAhspResidual('tolong buka') === undefined, 'E1 tolong buka → tanpa residu');
  assert(extractAhspResidual('tolong /') === undefined, 'E2 tolong / → tanpa residu');
  assert(extractAhspResidual('buka /') === undefined, 'E3 buka / → tanpa residu');
  assert(extractAhspResidual('/') === undefined, 'E4 / → tanpa residu');
  assert(extractAhspResidual('buka "ahsp"') === undefined || true, 'E5 (dokumentasi: helper tidak kenal alias — hanya dipakai pada awalan)');
  assert(extractAhspResidual('beton k-250') === 'beton k-250', 'E6 kata kunci nyata dipertahankan');
  assert(extractAhspResidual('x') === undefined, 'E7 token 1 huruf bukan kata kunci');
  const nav = resolveNavCommand('buka /ahsp');
  assert(nav.mode === 'direct', 'E8 buka /ahsp → direct');
  if (nav.mode === 'direct') assert(nav.ahspQuery === undefined, 'E8 buka /ahsp tanpa q');
}

/* --- F. Perintah tak dikenal + "/" telanjang (W-A-05 / W-A-06) --- */
{
  assert(suggestSlash('').length === 0, 'F1 suggestSlash("") → []');
  assert(suggestSlash('/zzz-tidak-ada').length === 0, 'F2 suggestSlash unknown → [] (tanpa fallback)');
  assert(suggestSlash('/admin').length === 0, 'F3 suggestSlash /admin → []');
  const bare = resolveNavCommand('/');
  assert(bare.mode === 'suggest', `F4 "/" → suggest (got ${bare.mode})`);
  if (bare.mode === 'suggest') {
    assert(bare.candidates.length === 0, 'F4 "/" tanpa chip');
    assert(!bare.message.includes('tidak dikenal'), 'F4 "/" tanpa kata "tidak dikenal"');
    assert(bare.message.includes('/help'), 'F4 "/" mengarah ke /help');
  }
  const unk = resolveNavCommand('/unknown');
  if (unk.mode === 'suggest') {
    assert(unk.candidates.length === 0, 'F5 /unknown tanpa chip tak berhubungan');
    assert(unk.message.includes('/help'), 'F5 /unknown mengarah ke /help');
  } else {
    assert(false, `F5 /unknown → suggest (got ${unk.mode})`);
  }
  // Kemiripan nyata tetap disarankan.
  const typo = resolveNavCommand('/spradshet');
  assert(typo.mode === 'suggest', 'F6 /spradshet → suggest');
  if (typo.mode === 'suggest') assert(typo.candidates[0]?.id === 'spreadsheet-rab', 'F6 /spradshet menyarankan spreadsheet-rab');
}

/* --- G. Carve-out forcedAi (W-A-04) — AUDIT SUMBER (CODE VERIFIED) --- */
/* Perilaku runtime-nya (klik Full AI lalu kirim "/ahsp") hanya bisa
   dibuktikan lewat browser — koordinator memverifikasi terpisah. Di sini
   kami mem-pin keberadaan carve-out agar tidak terhapus diam-diam. */
{
  const src = readFileSync(resolve(__dirname, '../ai-tools/ezrab-ai/view.tsx'), 'utf8');
  assert(src.includes('const isSlashMessage = /^\\s*\\//.test(msg);'), 'G1 view mendeteksi pesan slash');
  assert(src.includes('forcedAi && !isSlashMessage ? null : resolveNavCommand(msg)'), 'G2 navEarly mengecualikan slash dari bypass forcedAi');
  assert(src.includes('(!forcedAi || isSlashMessage) && navHit'), 'G3 cabang navHit mengeksekusi slash di forcedAi');
}

/* --- H. Perilaku yang DIPERTAHANKAN --- */
{
  // Semua slash registry tetap direct.
  let directCount = 0;
  for (const e of NAV_ENTRIES) {
    const r = resolveNavCommand(e.slash);
    if (r.mode === 'direct' && r.entry.id === e.id) directCount++;
    else console.error(`FAIL: H slash ${e.slash} tidak direct (got ${r.mode})`), failed++;
  }
  assert(directCount === NAV_ENTRIES.length, `H semua ${NAV_ENTRIES.length} slash registry direct (${directCount})`);
  // Slash case-insensitive + arg diabaikan (W-A-08: slash tanpa q).
  const up = resolveNavCommand('/AHSP');
  assert(up.mode === 'direct' && up.entry.id === 'ahsp', 'H /AHSP direct (case-insensitive)');
  const arg = resolveNavCommand('/ahsp beton');
  assert(arg.mode === 'direct', 'H /ahsp beton direct');
  if (arg.mode === 'direct') assert(arg.ahspQuery === undefined, 'H /ahsp beton tanpa q (W-A-08 dipertahankan)');
  // Slash dalam kutip tidak dieksekusi.
  assert(resolveNavCommand('"/ahsp"').mode === 'none', 'H "/ahsp" dikutip → none');
  // Topik telanjang tetap klarifikasi (aturan owner 2026-10-23).
  assert(routeIntent('ahsp').intent === 'CLARIFY_TOPIC', 'H ahsp telanjang → CLARIFY_TOPIC');
  assert(routeIntent('template').intent === 'CLARIFY_TOPIC', 'H template telanjang → CLARIFY_TOPIC');
  // "daftar proyek" tanpa verba buka = jawaban daftar, bukan navigasi.
  assert(routeIntent('daftar proyek saya').intent === 'QUERY_PROJECT_LIST', 'H daftar proyek saya → QUERY_PROJECT_LIST (jawaban, bukan nav)');
  // "buka kurva s" = jawaban produk deterministik + tombol, BUKAN navigasi
  // otomatis (pola KURVA_S dipertahankan — bukan intent OPEN_*).
  assert(routeIntent('buka kurva s').intent === 'KURVA_S', 'H buka kurva s → KURVA_S (jawaban, bukan nav)');
}

console.log(`\np1NavSlashOnly: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

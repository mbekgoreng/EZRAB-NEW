/**
 * Chat AI — Remediasi Batch 1: routing + how-to + error mapping
 * (Fase 5 misi, butir 8-10, 16).
 *
 * Tes DETERMINISTIK atas router, nav guard, teks deterministik, dan pemetaan
 * error gateway — bukan tes kualitas model. Tidak ada panggilan model live.
 */
import { routeIntent } from '../ai-tools/ezrab-ai/intentRouter';
import { resolveNavCommand } from '../ai-tools/ezrab-ai/navRegistry';
import {
  EXPLAIN_AHSP_VS_ESTIMATE_TEXT,
  METHODOLOGY_MISSING_AHSP_TEXT,
  HOWTO_EXCEL_EXPORT_TEXT,
} from '../ai-tools/ezrab-ai/chatExplanations';
import { mapGatewayHttpError } from '../ai-tools/providerClient';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; } else { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== 8. Pertanyaan konseptual mem-bypass pencarian item (Q13) ===');
{
  const r = routeIntent('Apa bedanya harga AHSP resmi dan Estimasi AI?');
  check('Q13 -> EXPLAIN_AHSP_VS_ESTIMATE', r.intent === 'EXPLAIN_AHSP_VS_ESTIMATE', r.intent);
  check('Q13 -> lokal (deterministik)', r.localOnly === true);
  check('Q13 -> bukan SEARCH_AHSP', r.intent !== 'SEARCH_AHSP');
  const v = routeIntent('apa bedanya ahsp dan estimasi ai');
  check('Q13 varian -> EXPLAIN', v.intent === 'EXPLAIN_AHSP_VS_ESTIMATE', v.intent);
  check('teks EXPLAIN menyebut Estimasi AI + Harga belum tersedia',
    EXPLAIN_AHSP_VS_ESTIMATE_TEXT.includes('Estimasi AI') && EXPLAIN_AHSP_VS_ESTIMATE_TEXT.includes('Harga belum tersedia'));
  check('teks EXPLAIN menyebut Lampiran VI', EXPLAIN_AHSP_VS_ESTIMATE_TEXT.includes('Lampiran VI'));
}

console.log('=== 9. Pertanyaan metodologi mem-bypass pencarian item (Q17) ===');
{
  const r = routeIntent('Kalau satu pekerjaan tidak ada di AHSP 2026, bagaimana?');
  check('Q17 -> METHODOLOGY_MISSING_AHSP', r.intent === 'METHODOLOGY_MISSING_AHSP', r.intent);
  check('Q17 -> lokal (deterministik)', r.localOnly === true);
  check('Q17 -> bukan SEARCH_AHSP', r.intent !== 'SEARCH_AHSP');
  check('teks METHODOLOGY menyebut PARSIAL + Harga belum tersedia',
    METHODOLOGY_MISSING_AHSP_TEXT.includes('PARSIAL') && METHODOLOGY_MISSING_AHSP_TEXT.includes('Harga belum tersedia'));
  check('teks METHODOLOGY melarang substitusi kode', METHODOLOGY_MISSING_AHSP_TEXT.includes('tidak diganti dengan item lain'));
}

console.log('=== 10. How-to Excel: langkah terverifikasi mendahului kartu navigasi (Q18) ===');
{
  const r = routeIntent('Bagaimana cara mengekspor RAB ke Excel?');
  check('Q18 -> HOWTO_EXCEL_EXPORT', r.intent === 'HOWTO_EXCEL_EXPORT', r.intent);
  check('Q18 -> lokal (deterministik)', r.localOnly === true);
  const nav = resolveNavCommand('Bagaimana cara mengekspor RAB ke Excel?');
  check('Q18 -> nav guard: bukan kartu navigasi', nav.mode === 'none', nav.mode);
  check('teks HOWTO menyebut menu Laporan', HOWTO_EXCEL_EXPORT_TEXT.includes('menu Laporan'));
  check('teks HOWTO menyebut tombol persis', HOWTO_EXCEL_EXPORT_TEXT.includes('Export Excel (.xlsx)'));
  check('teks HOWTO menyebut workbook 16 sheet', HOWTO_EXCEL_EXPORT_TEXT.includes('16 sheet'));
  check('teks HOWTO menyebut RAB proyek aktif', HOWTO_EXCEL_EXPORT_TEXT.includes('proyek yang sedang aktif'));
}

console.log('=== Preseden navigasi asli tetap utuh ===');
{
  const open = resolveNavCommand('bagaimana cara membuka RAB');
  check('cara membuka RAB -> tetap suggest', open.mode === 'suggest', open.mode);
  check('cara membuka RAB -> entry RAB & Estimasi', (open as any).entry?.id === 'rab-estimasi');
  const direct = resolveNavCommand('buka RAB');
  check('buka RAB -> tetap direct', direct.mode === 'direct', direct.mode);
  const q1 = routeIntent('Kode AHSP plesteran dinding campuran 1:4 dan berapa harganya per m2?');
  check('Q1 -> tetap SEARCH_AHSP + param utuh', q1.intent === 'SEARCH_AHSP' && (q1.param ?? '').startsWith('plesteran dinding'), `${q1.intent} / ${q1.param}`);
  const q2 = routeIntent('Berapa harga AHSP 2026 pekerjaan beton K-225 per m3?');
  check('Q2 -> tetap SEARCH_AHSP', q2.intent === 'SEARCH_AHSP', q2.intent);
  const bare = routeIntent('ahsp');
  check('topik telanjang ahsp -> tetap CLARIFY_TOPIC', bare.intent === 'CLARIFY_TOPIC', bare.intent);
  const generic = routeIntent('jelaskan perbedaan ahsp resmi dengan estimasi ai');
  check('konseptual umum -> CONCEPTUAL_AHSP mengalir ke AI', generic.intent === 'CONCEPTUAL_AHSP' && generic.localOnly === false, `${generic.intent} localOnly=${generic.localOnly}`);
  const greet = routeIntent('halo');
  check('sapaan -> tetap GREETING', greet.intent === 'GREETING', greet.intent);
}

console.log('=== 16. Pemetaan error tetap dapat dibedakan + retry utuh ===');
{
  const auth = mapGatewayHttpError(401, '');
  check('401 -> AUTH_REQUIRED, tidak retryable', auth.code === 'AUTH_REQUIRED' && auth.retryable === false, `${auth.code} retryable=${auth.retryable}`);
  const demo = mapGatewayHttpError(403, 'DEMO_RESTRICTED');
  check('403 DEMO -> DEMO_RESTRICTED, tidak retryable', demo.code === 'DEMO_RESTRICTED' && demo.retryable === false);
  const rate = mapGatewayHttpError(429, '');
  check('429 -> retryable + pesan rate-limit', rate.retryable === true && rate.message.includes('Terlalu banyak'));
  const five = mapGatewayHttpError(500, '');
  check('500 -> retryable + pesan gangguan generik (jujur, bukan klaim penyebab)', five.retryable === true && five.message.includes('gangguan'));
  check('pesan 401 != pesan 500 (tidak melebur)', auth.message !== five.message);
}

console.log(`\n=== HASIL: ${pass} PASS, ${fail} FAIL ===`);
if (fail > 0) process.exit(1);

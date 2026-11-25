/**
 * EZRAB Chat AI — Perintah deterministik PENGATURAN PROYEK (2026-11-17,
 * gap P4 audit perintah Ezrab AI; matriks L #43–#44).
 * Satu intent UPDATE_PROJECT_SETTINGS: "ubah overhead jadi 10%",
 * "overhead 10%", "PPN 11%", "profit 5%", "ubah profit jadi 7,5%".
 * Pola persis RENAME_PROJECT: eksekusi langsung lewat callback view
 * (updateProject parsial) — tanpa LLM, tanpa kredit.
 *
 * CATATAN: wiring ke intentRouter/actionRegistry/view dilakukan
 * koordinator; suite ini menguji modul commands/ langsung. Pola diuji
 * lewat matcher lokal yang meniru loop routeIntent (teks ternormalisasi
 * huruf kecil, pola pertama yang cocok menang, param = grup tangkap 1).
 * Run: npx tsx src/test/chatProjectSettingsCommands.test.ts
 */
import {
  PROJECT_SETTINGS_PATTERNS,
  parseSettingsPatch,
  handleProjectSettingsCommand,
  formatPercentValue,
  type ProjectSettingsCommandContext,
  type ProjectSettingsPatch,
} from '../ai-tools/ezrab-ai/commands/projectSettingsCommands';
import { routeIntent } from '../ai-tools/ezrab-ai/intentRouter';

let passed = 0;
let failed = 0;
function assert(cond: boolean, name: string): void {
  if (cond) { passed++; }
  else { failed++; console.error('FAIL:', name); }
}

/** Tiruan loop routeIntent untuk pola kelompok ini saja. */
function matchSettings(raw: string): { matched: boolean; param?: string } {
  const input = raw.toLowerCase().trim().replace(/\s+/g, ' ');
  for (const p of PROJECT_SETTINGS_PATTERNS) {
    const m = input.match(p.re);
    if (m) {
      const param = p.paramGroup ? (m[1] ?? '').trim() || undefined : undefined;
      return { matched: true, param };
    }
  }
  return { matched: false };
}

/** Verifikasi patch PERSIS: tidak ada key tambahan, tidak ada key hilang. */
function assertPatch(actual: ProjectSettingsPatch | undefined, expected: ProjectSettingsPatch, name: string): void {
  assert(actual !== undefined, `${name} (patch diteruskan ke callback)`);
  const aKeys = actual ? Object.keys(actual).sort() : [];
  const eKeys = Object.keys(expected).sort();
  assert(
    JSON.stringify(aKeys) === JSON.stringify(eKeys),
    `${name} (keys persis: [${aKeys.join(', ')}] vs [${eKeys.join(', ')}])`,
  );
  for (const k of eKeys) {
    assert(
      (actual as unknown as Record<string, unknown>)[k] === (expected as unknown as Record<string, unknown>)[k],
      `${name} (${k} = ${String((expected as unknown as Record<string, unknown>)[k])})`,
    );
  }
}

/* --- A. Pola: tiap field + varian --- */

{
  const r = matchSettings('ubah overhead jadi 10%');
  assert(r.matched && r.param === 'overhead jadi 10%', 'A1: ubah overhead jadi 10% → cocok, param ekor field');
}
{
  const r = matchSettings('overhead 10%');
  assert(r.matched && r.param === 'overhead 10%', 'A2: overhead 10% (telanjang) → cocok');
}
{
  const r = matchSettings('PPN 11%');
  assert(r.matched && r.param === 'ppn 11%', 'A3: PPN 11% (huruf besar) → cocok, param ternormalisasi');
}
{
  const r = matchSettings('profit 5%');
  assert(r.matched && r.param === 'profit 5%', 'A4: profit 5% → cocok');
}
{
  const r = matchSettings('ubah profit jadi 7,5%');
  assert(r.matched && r.param === 'profit jadi 7,5%', 'A5: koma desimal 7,5% → cocok');
}
{
  const r = matchSettings('ubah overhead jadi 10');
  assert(r.matched && r.param === 'overhead jadi 10', 'A6: tanpa % (ada kata kerja) → cocok');
}
{
  const r = matchSettings('ubah overhead 10%');
  assert(r.matched && r.param === 'overhead 10%', 'A7: kata kerja + angka langsung (tanpa jadi) → cocok');
}
{
  const r = matchSettings('set ppn ke 11%');
  assert(r.matched && r.param === 'ppn ke 11%', 'A8: set ppn ke 11% → cocok');
}
{
  const r = matchSettings('ganti keuntungan jadi 8%');
  assert(r.matched && r.param === 'keuntungan jadi 8%', 'A9: sinonim keuntungan → cocok');
}
{
  const r = matchSettings('pph 2%');
  assert(r.matched && r.param === 'pph 2%', 'A10: pph 2% → cocok');
}
{
  const r = matchSettings('overhead 10% profit 5%');
  assert(r.matched && r.param === 'overhead 10% profit 5%', 'A11: multi-field telanjang → cocok, param utuh');
}
{
  const r = matchSettings('ubah overhead jadi 10% profit 5%');
  assert(r.matched && r.param === 'overhead jadi 10% profit 5%', 'A12: multi-field kata kerja → cocok');
}
{
  const r = matchSettings('tolong ubah overhead jadi 10%');
  assert(r.matched && r.param === 'overhead jadi 10%', 'A13: tolong + perintah → cocok (bukan HELP)');
}
{
  const r = matchSettings('ubah pajak jadi 11%');
  assert(r.matched && r.param === 'pajak jadi 11%', 'A14: pajak saja (dengan nilai) → cocok, handler yang bertanya');
}
{
  const r = matchSettings('ubah overhead');
  assert(r.matched && r.param === undefined, 'A15: ubah overhead tanpa nilai → cocok tanpa param (klarifikasi router)');
}
{
  const r = matchSettings('ubah overhead proyek ini');
  assert(r.matched && r.param === undefined, 'A16: ubah overhead proyek ini → klarifikasi, bukan UNKNOWN');
}
{
  const r = matchSettings('ubah overhead jadi');
  assert(r.matched && r.param === undefined, 'A17: ubah overhead jadi (tanpa nilai) → klarifikasi');
}
{
  const r = matchSettings('ubah overhead 0%');
  assert(r.matched && r.param === 'overhead 0%', 'A18: nilai 0 eksplisit → cocok');
}

/* --- B. Non-hijack: pola ini TIDAK boleh cocok; intent lama tetap utuh --- */

{
  assert(!matchSettings('berapa overhead proyek ini?').matched, 'B1: pertanyaan "berapa overhead" → bukan intent ini');
  assert(!matchSettings('berapa profit proyek ini?').matched, 'B2: pertanyaan "berapa profit" → bukan intent ini');
  assert(!matchSettings('berapa ppn proyek ini?').matched, 'B3: pertanyaan "berapa ppn" → bukan intent ini');
  assert(!matchSettings('overhead proyek ini berapa persen?').matched, 'B4: pertanyaan berbalik → bukan intent ini');
  assert(!matchSettings('ubah harga plesteran jadi Rp 50.000').matched, 'B5: ubah harga item → bukan settings');
  assert(!matchSettings('berapa total proyek saya?').matched, 'B6: total proyek → bukan settings');
  assert(!matchSettings('buka pengaturan').matched, 'B7: buka pengaturan → bukan settings');
  assert(!matchSettings('ubah nama proyek menjadi Rumah Impian').matched, 'B8: rename → bukan settings');
  assert(!matchSettings('ubah volume plesteran jadi 25 m2').matched, 'B9: ubah volume → bukan settings');
  assert(!matchSettings('cari ahsp beton').matched, 'B10: cari AHSP → bukan settings');
  assert(!matchSettings('overhead 10').matched, 'B11: field + angka telanjang tanpa % dan tanpa kata kerja → bukan perintah');
  // Intent lama (router saat ini, belum di-wiring kelompok ini) tetap utuh:
  assert(routeIntent('ubah harga plesteran jadi Rp 50.000').intent === 'UPDATE_ITEM_PRICE', 'B12: harga item tetap UPDATE_ITEM_PRICE');
  assert(routeIntent('berapa total proyek saya?').intent === 'QUERY_PROJECT_TOTAL', 'B13: total tetap QUERY_PROJECT_TOTAL');
  assert(routeIntent('ubah nama proyek menjadi Rumah Impian').intent === 'RENAME_PROJECT', 'B14: rename tetap RENAME_PROJECT');
  assert(routeIntent('ubah volume plesteran jadi 25 m2').intent === 'UPDATE_ITEM_VOLUME', 'B15: volume tetap UPDATE_ITEM_VOLUME');
  // WB-01 follow-up (Fast Track): pertanyaan hitungan "X% dari Rp..." bukan perintah setelan.
  assert(routeIntent('PPN 11% dari Rp 1.000.000').intent === 'CALCULATE', 'B16: PPN 11% dari Rp 1.000.000 → CALCULATE (bukan setelan)');
  assert(routeIntent('berapa PPN 11% dari Rp 1.000.000?').intent === 'CALCULATE', 'B17: berapa PPN 11% dari … → CALCULATE');
  assert(routeIntent('PPN 11%').intent === 'UPDATE_PROJECT_SETTINGS', 'B18: PPN 11% telanjang tetap perintah setelan');
  assert(routeIntent('ubah ppn dari 10% jadi 11%').intent === 'UPDATE_PROJECT_SETTINGS', 'B19: ubah ppn dari 10% jadi 11% tetap perintah (kata kerja)');
}

/* --- C. Parser --- */

{
  const p = parseSettingsPatch('overhead jadi 10%');
  assert(p.ok && p.patch.overheadPercent === 10, 'C1: overhead 10% → patch');
  assert(p.ok && Object.keys(p.patch).length === 1, 'C2: patch HANYA overheadPercent (tanpa field 0 tambahan)');
}
{
  const p = parseSettingsPatch('ppn 11%');
  assert(p.ok && p.patch.ppnPercent === 11 && p.patch.ppnEnabled === true, 'C3: PPN 11% → ppnPercent + ppnEnabled');
  assert(p.ok && !('taxPercent' in p.patch), 'C4: taxPercent TIDAK ditulis (tidak ada pembaca kanonis)');
}
{
  const p = parseSettingsPatch('pph 2%');
  assert(p.ok && p.patch.pphPercent === 2 && p.patch.pphEnabled === true, 'C5: PPh 2% → pphPercent + pphEnabled');
}
{
  const p = parseSettingsPatch('profit jadi 7,5%');
  assert(p.ok && p.patch.profitPercent === 7.5, 'C6: koma desimal 7,5% → 7.5');
}
{
  const p = parseSettingsPatch('keuntungan jadi 8%');
  assert(p.ok && p.patch.profitPercent === 8, 'C7: keuntungan → profitPercent');
}
{
  const p = parseSettingsPatch('overhead jadi 10% profit 5%');
  assert(p.ok && p.patch.overheadPercent === 10 && p.patch.profitPercent === 5, 'C8: multi-field → kedua nilai');
  assert(p.ok && Object.keys(p.patch).length === 2, 'C9: multi-field patch persis 2 key');
}
{
  const p = parseSettingsPatch('overhead dan profit jadi 5%');
  assert(p.ok && p.patch.overheadPercent === 5 && p.patch.profitPercent === 5, 'C10: nilai bersama → kedua field 5%');
}
{
  const p = parseSettingsPatch('overhead proyek ini jadi 10%');
  assert(p.ok && p.patch.overheadPercent === 10, 'C11: kata sisipan antara field dan nilai tetap terbaca');
}
{
  const p = parseSettingsPatch('overhead 0%');
  assert(p.ok && p.patch.overheadPercent === 0, 'C12: 0 eksplisit VALID dan diterapkan (bukan diabaikan)');
}
{
  const p = parseSettingsPatch('overhead jadi 101%');
  assert(!p.ok && p.reason === 'out-of-range', 'C13: 101 → ditolak');
  assert(!p.ok && p.reason === 'out-of-range' && p.value === 101, 'C14: penolakan menyebut nilai 101');
}
{
  const p = parseSettingsPatch('overhead jadi -5%');
  assert(!p.ok && p.reason === 'out-of-range', 'C15: -5 → ditolak');
}
{
  const p = parseSettingsPatch('overhead jadi 10% profit jadi 150%');
  assert(!p.ok && p.reason === 'out-of-range', 'C16: all-or-nothing — satu tidak valid, seluruh parse gagal');
}
{
  const p = parseSettingsPatch('pajak jadi 11%');
  assert(!p.ok && p.reason === 'ambiguous-tax', 'C17: pajak saja → ambigu (tanya PPN/PPh)');
}
{
  const p = parseSettingsPatch('overhead jadi 10% pajak jadi 11%');
  assert(!p.ok && p.reason === 'ambiguous-tax', 'C18: pajak ambigu menahan seluruh perintah (termasuk overhead valid)');
}
{
  const p = parseSettingsPatch('overhead');
  assert(!p.ok && p.reason === 'empty', 'C19: field tanpa nilai → empty');
}
{
  const p = parseSettingsPatch('halo');
  assert(!p.ok && p.reason === 'empty', 'C20: tanpa field → empty');
}
{
  const p = parseSettingsPatch('overhead 10% overhead 12%');
  assert(p.ok && p.patch.overheadPercent === 12, 'C21: field disebut dua kali → nilai terakhir menang');
}
{
  assert(formatPercentValue(10) === '10', 'C22: format bulat tanpa desimal');
  assert(formatPercentValue(7.5) === '7,5', 'C23: format desimal pakai koma');
}

/* --- D. Handler dengan ctx stub --- */

function makeCtx(over: Partial<ProjectSettingsCommandContext> = {}): {
  ctx: ProjectSettingsCommandContext;
  calls: Array<{ id: string; patch: ProjectSettingsPatch }>;
  succeed: { v: boolean };
} {
  const calls: Array<{ id: string; patch: ProjectSettingsPatch }> = [];
  const succeed = { v: true };
  const ctx: ProjectSettingsCommandContext = {
    activeProject: { id: 'p1', name: 'Rumah Tinggal 2 Lantai' },
    updateProjectSettings: (id: string, patch: ProjectSettingsPatch) => {
      calls.push({ id, patch });
      return succeed.v;
    },
    ...over,
  };
  return { ctx, calls, succeed };
}

// D1. Sukses tiap field — patch PERSIS (tidak ada field 0 tambahan)
{
  const { ctx, calls } = makeCtx();
  const r = handleProjectSettingsCommand('UPDATE_PROJECT_SETTINGS', 'overhead jadi 10%', ctx);
  assert(r !== null && r.ok === true, 'D1: overhead sukses → ok');
  assert(calls.length === 1 && calls[0].id === 'p1', 'D1: callback dipanggil sekali dengan id proyek');
  assertPatch(calls[0]?.patch, { overheadPercent: 10 }, 'D1: patch overhead');
  assert((r?.message ?? '').includes('Overhead: 10%'), 'D1: balasan menyebut Overhead 10%');
}
{
  const { ctx, calls } = makeCtx();
  const r = handleProjectSettingsCommand('UPDATE_PROJECT_SETTINGS', 'profit 5%', ctx);
  assert(r !== null && r.ok === true, 'D2: profit sukses → ok');
  assertPatch(calls[0]?.patch, { profitPercent: 5 }, 'D2: patch profit');
}
{
  const { ctx, calls } = makeCtx();
  const r = handleProjectSettingsCommand('UPDATE_PROJECT_SETTINGS', 'ppn 11%', ctx);
  assert(r !== null && r.ok === true, 'D3: PPN sukses → ok');
  assertPatch(calls[0]?.patch, { ppnPercent: 11, ppnEnabled: true }, 'D3: patch PPN (rate + flag, tanpa taxPercent)');
  assert((r?.message ?? '').includes('PPN: 11%') && (r?.message ?? '').includes('diaktifkan'), 'D3: balasan menyebut PPN diaktifkan');
}
{
  const { ctx, calls } = makeCtx();
  const r = handleProjectSettingsCommand('UPDATE_PROJECT_SETTINGS', 'pph 2%', ctx);
  assert(r !== null && r.ok === true, 'D4: PPh sukses → ok');
  assertPatch(calls[0]?.patch, { pphPercent: 2, pphEnabled: true }, 'D4: patch PPh');
}
{
  const { ctx, calls } = makeCtx();
  const r = handleProjectSettingsCommand('UPDATE_PROJECT_SETTINGS', 'overhead 0%', ctx);
  assert(r !== null && r.ok === true, 'D5: overhead 0% sukses → ok');
  assertPatch(calls[0]?.patch, { overheadPercent: 0 }, 'D5: patch overhead 0 (nilai 0 diteruskan, bukan dibuang)');
}
// D6. Multi-field: satu panggilan, semua field, dilaporkan satu per satu
{
  const { ctx, calls } = makeCtx();
  const r = handleProjectSettingsCommand('UPDATE_PROJECT_SETTINGS', 'overhead jadi 10% profit 5%', ctx);
  assert(r !== null && r.ok === true && calls.length === 1, 'D6: multi-field → satu panggilan callback');
  assertPatch(calls[0]?.patch, { overheadPercent: 10, profitPercent: 5 }, 'D6: patch multi-field');
  assert(
    (r?.message ?? '').includes('Overhead: 10%') && (r?.message ?? '').includes('Profit: 5%'),
    'D6: balasan melaporkan tiap pengaturan satu per satu',
  );
}
// D7. Nilai tak valid → ditolak menyebut nilai + batas, callback TIDAK dipanggil
{
  const { ctx, calls } = makeCtx();
  const r = handleProjectSettingsCommand('UPDATE_PROJECT_SETTINGS', 'overhead jadi 101%', ctx);
  assert(calls.length === 0, 'D7: 101% → callback tidak dipanggil');
  assert(r !== null && r.ok === false, 'D7: 101% → ok false');
  assert((r?.message ?? '').includes('101') && (r?.message ?? '').includes('0–100'), 'D7: pesan menyebut nilai 101 + batas 0–100');
}
{
  const { ctx, calls } = makeCtx();
  const r = handleProjectSettingsCommand('UPDATE_PROJECT_SETTINGS', 'overhead jadi 10% profit jadi 150%', ctx);
  assert(calls.length === 0, 'D8: all-or-nothing — satu tidak valid, tidak ada yang diterapkan');
  assert(r !== null && r.ok === false, 'D8: all-or-nothing → ok false');
}
// D9. Pajak ambigu → bertanya, callback TIDAK dipanggil
{
  const { ctx, calls } = makeCtx();
  const r = handleProjectSettingsCommand('UPDATE_PROJECT_SETTINGS', 'pajak jadi 11%', ctx);
  assert(calls.length === 0, 'D9: pajak ambigu → callback tidak dipanggil');
  assert(r !== null && r.ok === true, 'D9: pajak ambigu → ok true (pertanyaan klarifikasi)');
  assert((r?.message ?? '').includes('PPN') && (r?.message ?? '').includes('PPh'), 'D9: pesan menanyakan PPN atau PPh');
}
// D10. Param kosong / tanpa nilai → minta nilai, callback TIDAK dipanggil
{
  const { ctx, calls } = makeCtx();
  const r = handleProjectSettingsCommand('UPDATE_PROJECT_SETTINGS', '   ', ctx);
  assert(calls.length === 0, 'D10: param kosong → callback tidak dipanggil');
  assert(r !== null && (r.message ?? '').includes('berapa persen'), 'D10: pesan meminta nilai persen');
}
{
  const { ctx, calls } = makeCtx();
  const r = handleProjectSettingsCommand('UPDATE_PROJECT_SETTINGS', undefined, ctx);
  assert(calls.length === 0, 'D11: param undefined → callback tidak dipanggil');
  assert(r !== null && r.ok === true, 'D11: param undefined → ok true (klarifikasi)');
}
// D12. Tanpa proyek aktif: jujur, callback TIDAK dipanggil
{
  const { ctx, calls } = makeCtx({ activeProject: null });
  const r = handleProjectSettingsCommand('UPDATE_PROJECT_SETTINGS', 'overhead jadi 10%', ctx);
  assert(calls.length === 0, 'D12: tanpa proyek aktif → callback tidak dipanggil');
  assert(r !== null && r.message.includes('Tidak ada proyek aktif'), 'D12: pesan jujur tanpa proyek aktif');
  assert(r !== null && !r.message.includes('diubah:'), 'D12: tidak ada klaim berhasil');
}
// D13. Tanpa callback (fail-closed): jujur "belum bisa"
{
  const { ctx } = makeCtx();
  delete (ctx as Partial<ProjectSettingsCommandContext>).updateProjectSettings;
  const r = handleProjectSettingsCommand('UPDATE_PROJECT_SETTINGS', 'overhead jadi 10%', ctx);
  assert(r !== null && r.ok === false, 'D13: tanpa callback → ok false');
  assert(r !== null && r.message.includes('belum bisa'), 'D13: pesan jujur belum bisa dari chat');
}
// D14. Callback false (id tidak ditemukan): TIDAK mengklaim berhasil
{
  const { ctx, succeed } = makeCtx();
  succeed.v = false;
  const r = handleProjectSettingsCommand('UPDATE_PROJECT_SETTINGS', 'overhead jadi 10%', ctx);
  assert(r !== null && r.ok === false, 'D14: callback false → ok false');
  assert(r !== null && r.message.includes('belum berubah'), 'D14: pesan jujur belum berubah');
  assert(r !== null && !r.message.includes('diubah:'), 'D14: tidak ada klaim berhasil');
}
// D15. Intent lain → null (bukan milik kelompok ini)
{
  const { ctx } = makeCtx();
  assert(handleProjectSettingsCommand('UPDATE_ITEM_PRICE', 'plesteran jadi Rp 50.000', ctx) === null, 'D15: UPDATE_ITEM_PRICE → null');
  assert(handleProjectSettingsCommand('RENAME_PROJECT', 'Rumah Impian', ctx) === null, 'D15: RENAME_PROJECT → null');
  assert(handleProjectSettingsCommand('UNKNOWN', undefined, ctx) === null, 'D15: UNKNOWN → null');
}

console.log(`chatProjectSettingsCommands: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

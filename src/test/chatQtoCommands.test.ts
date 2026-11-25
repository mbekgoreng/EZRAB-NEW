/**
 * EZRAB Chat AI — Perintah deterministik QTO (2026-11-17, matriks E
 * #30–#31 audit perintah Ezrab AI + gap P7).
 * CREATE_QTO_ITEM ("buat item QTO galian tanah 10 m3") dan SYNC_QTO
 * ("sinkronkan QTO galian ke RAB" / "sinkronkan semua QTO") dijawab
 * lapisan deterministik lewat callback view (pola RENAME_PROJECT) —
 * tanpa LLM, tanpa kredit. Modul diuji di sini BELUM di-wiring ke
 * intentRouter/actionRegistry (koordinator yang me-wiring) — karena
 * itu Bagian A/B memakai mini-router lokal yang meniru semantik
 * routeIntent (normalisasi huruf kecil → pola pertama yang cocok →
 * param dari teks ASLI via re-match case-insensitive).
 * Run: npx tsx src/test/chatQtoCommands.test.ts
 */
import {
  QTO_PATTERNS,
  QTO_CREATE_INTENT,
  QTO_SYNC_INTENT,
  CREATE_QTO_CLARIFICATION,
  SYNC_QTO_CLARIFICATION,
  parseCreateQtoTarget,
  parseSyncQtoTarget,
  qtoHasTransferablePrice,
  resolveQtoItemByName,
  formatQtoItemLabel,
  handleQtoCommand,
  type QtoCommandContext,
  type QtoChatItem,
} from '../ai-tools/ezrab-ai/commands/qtoCommands';

let passed = 0;
let failed = 0;
function assert(cond: boolean, name: string): void {
  if (cond) { passed++; }
  else { failed++; console.error('FAIL:', name); }
}

/* --- Mini-router: cermin semantik routeIntent untuk QTO_PATTERNS --- */

function matchQto(rawInput: string): { intent: string; param?: string } | null {
  const input = rawInput.toLowerCase().trim().replace(/\s+/g, ' ');
  for (const p of QTO_PATTERNS) {
    const m = input.match(p.re);
    if (!m) continue;
    let param: string | undefined;
    if (p.paramGroup) {
      const rawRe = new RegExp(p.re.source, 'i');
      const rawM = rawInput.match(rawRe);
      param = (rawM?.[1] ?? m[1] ?? '').trim() || undefined;
    }
    return { intent: p.intent, param };
  }
  return null;
}

/* --- A. Pola: tiap intent --- */

{
  const r = matchQto('buat item QTO galian tanah 10 m3');
  assert(r?.intent === QTO_CREATE_INTENT && r?.param === 'galian tanah 10 m3', 'A1: buat item QTO … → CREATE_QTO_ITEM + param');
}
{
  const r = matchQto('buatkan QTO urugan pasir 5 m3');
  assert(r?.intent === QTO_CREATE_INTENT && r?.param === 'urugan pasir 5 m3', 'A2: buatkan QTO … → CREATE_QTO_ITEM');
}
{
  const r = matchQto('tambah QTO pondasi batu kali 2 m3');
  assert(r?.intent === QTO_CREATE_INTENT && r?.param === 'pondasi batu kali 2 m3', 'A3: tambah QTO … → CREATE_QTO_ITEM (bukan ADD_ITEM)');
}
{
  const r = matchQto('buat QTO baru galian tanah 10 m3');
  assert(r?.intent === QTO_CREATE_INTENT && r?.param === 'galian tanah 10 m3', 'A4: "baru" opsional tidak masuk param');
}
{
  const r = matchQto('buat item QTO');
  assert(r?.intent === QTO_CREATE_INTENT && r?.param === undefined, 'A5: buat item QTO tanpa uraian → CREATE_QTO_ITEM tanpa param (klarifikasi)');
}
{
  const r = matchQto('tolong buatkan item QTO galian tanah 10 m3');
  assert(r?.intent === QTO_CREATE_INTENT && r?.param === 'galian tanah 10 m3', 'A6: tolong + perintah QTO → CREATE_QTO_ITEM (bukan HELP)');
}
{
  const r = matchQto('sinkronkan QTO galian ke RAB');
  assert(r?.intent === QTO_SYNC_INTENT && r?.param === 'galian ke RAB', 'A7: sinkronkan QTO … ke RAB → SYNC_QTO + param');
}
{
  const r = matchQto('sinkronkan QTO galian');
  assert(r?.intent === QTO_SYNC_INTENT && r?.param === 'galian', 'A8: sinkronkan QTO … (tanpa ke RAB) → SYNC_QTO');
}
{
  const r = matchQto('sinkronkan semua QTO');
  assert(r?.intent === QTO_SYNC_INTENT && (r?.param ?? '').toLowerCase().includes('semua'), 'A9: sinkronkan semua QTO → SYNC_QTO + param massal');
}
{
  const r = matchQto('sinkronkan semua QTO ke RAB');
  assert(r?.intent === QTO_SYNC_INTENT && (r?.param ?? '').toLowerCase().includes('semua'), 'A10: sinkronkan semua QTO ke RAB → SYNC_QTO massal (bukan param "ke rab")');
}
{
  const r = matchQto('sinkronkan galian ke RAB');
  assert(r?.intent === QTO_SYNC_INTENT && r?.param === 'galian', 'A11: sinkronkan … ke RAB tanpa kata QTO → SYNC_QTO');
}
{
  const r = matchQto('sinkronkan QTO');
  assert(r?.intent === QTO_SYNC_INTENT && r?.param === undefined, 'A12: sinkronkan QTO tanpa nama → SYNC_QTO tanpa param (klarifikasi)');
}
{
  const r = matchQto('sinkronisasi QTO urugan pasir ke RAB');
  assert(r?.intent === QTO_SYNC_INTENT && r?.param === 'urugan pasir ke RAB', 'A13: bentuk benda "sinkronisasi" → SYNC_QTO');
}

/* --- B. Pola: non-hijack --- */

{
  assert(matchQto('hitung volume galian 10 m3') === null, 'B1: hitung volume … bukan CREATE_QTO_ITEM (itu CALCULATE/hitung_qto)');
  assert(matchQto('hitung QTO galian 10 m3') === null, 'B2: hitung QTO … bukan perintah buat/sinkron');
  assert(matchQto('buka kalkulator volume') === null, 'B3: buka kalkulator volume bukan intent QTO');
  assert(matchQto('buka QTO') === null, 'B4: buka QTO bukan intent QTO (§4.1: ke AI, bukan navigasi OPEN_QTO)');
  assert(matchQto('tambah item plesteran 10 m2') === null, 'B5: tambah item (tanpa QTO) bukan CREATE_QTO_ITEM (itu ADD_ITEM)');
  assert(matchQto('buatkan RAB rumah type 70 2 lantai') === null, 'B6: buat RAB bukan CREATE_QTO_ITEM');
  assert(matchQto('berapa total proyek saya?') === null, 'B7: pertanyaan total bukan intent QTO');
  assert(matchQto('hapus item QTO galian') === null, 'B8: hapus item QTO bukan intent kelompok ini (di luar scope)');
  assert(matchQto('berapa volume galian?') === null, 'B9: pertanyaan volume bukan intent QTO');
}

/* --- C. Parser: CREATE target --- */

{
  const t = parseCreateQtoTarget('galian tanah 10 m3');
  assert(t.uraian === 'galian tanah' && t.quantity === 10 && t.unit === 'm3', 'C1: galian tanah 10 m3 → uraian + 10 m3');
}
{
  const t = parseCreateQtoTarget('urugan pasir 2,5 m3');
  assert(t.uraian === 'urugan pasir' && t.quantity === 2.5 && t.unit === 'm3', 'C2: koma desimal → 2.5 m3');
}
{
  const t = parseCreateQtoTarget('bouwplank 30 m\'');
  assert(t.uraian === 'bouwplank' && t.quantity === 30 && t.unit === "m'", 'C3: meter lari m\' diterima');
}
{
  const t = parseCreateQtoTarget('galian tanah');
  assert(t.uraian === 'galian tanah' && t.quantity === null && t.unit === null && t.bareVolume === null, 'C4: tanpa angka → quantity/unit null');
}
{
  const t = parseCreateQtoTarget('galian tanah 10');
  assert(t.uraian === 'galian tanah' && t.bareVolume === 10 && t.quantity === null, 'C5: angka telanjang → bareVolume 10, satuan tetap ditanya');
}
{
  const t = parseCreateQtoTarget('plesteran 1:4');
  assert(t.uraian === 'plesteran 1:4' && t.bareVolume === null, 'C6: rasio 1:4 BUKAN volume telanjang');
}
{
  const t = parseCreateQtoTarget('beton K225 5 m3');
  assert(t.uraian === 'beton K225' && t.quantity === 5 && t.unit === 'm3', 'C7: mutu K225 tetap di uraian');
}
{
  const t = parseCreateQtoTarget('bouwplank 30 m');
  assert(t.quantity === null && t.bareVolume === null, 'C8: satuan m telanjang ditolak (jarak, bukan volume)');
}
{
  const t = parseCreateQtoTarget('galian tanah 10 m³');
  assert(t.quantity === 10 && t.unit === 'm3', 'C9: m³ ternormalisasi ke m3');
}
{
  const t = parseCreateQtoTarget('');
  assert(t.uraian === '' && t.quantity === null, 'C10: param kosong → uraian kosong');
}

/* --- D. Parser: SYNC target --- */

{
  const t = parseSyncQtoTarget('galian ke RAB');
  assert(t.kind === 'named' && t.name === 'galian', 'D1: "galian ke RAB" → named galian');
}
{
  const t = parseSyncQtoTarget('Galian Tanah Biasa');
  assert(t.kind === 'named' && t.name === 'Galian Tanah Biasa', 'D2: kapitalisasi nama dipertahankan');
}
{
  assert(parseSyncQtoTarget('semua QTO ke RAB').kind === 'all', 'D3: semua QTO ke RAB → all');
  assert(parseSyncQtoTarget('semua QTO').kind === 'all', 'D4: semua QTO → all');
  assert(parseSyncQtoTarget('semua').kind === 'all', 'D5: semua → all');
  assert(parseSyncQtoTarget('semua item QTO').kind === 'all', 'D6: semua item QTO → all');
}
{
  const t = parseSyncQtoTarget('semua QTO galian ke RAB');
  assert(t.kind === 'named' && t.name === 'galian', 'D7: "semua QTO galian" → named galian, BUKAN massal');
}
{
  assert(parseSyncQtoTarget('').kind === 'empty', 'D8: kosong → empty');
  assert(parseSyncQtoTarget('ke RAB').kind === 'empty', 'D9: "ke RAB" saja → empty');
  assert(parseSyncQtoTarget(undefined).kind === 'empty', 'D10: undefined → empty');
}

/* --- E. Penanda tanpa-harga + resolusi nama --- */

{
  assert(qtoHasTransferablePrice({ id: 'x', uraian: 'A', quantity: 1, unit: 'm3', unitPrice: 80000, priceUnit: 'm3' }).priced, 'E1: harga tersimpan + satuan cocok → berharga');
  assert(qtoHasTransferablePrice({ id: 'x', uraian: 'A', quantity: 1, unit: 'm3', unitPrice: 80000 }).priced, 'E2: tanpa priceUnit → berharga (tidak ada ketidakcocokan)');
  const noPrice = qtoHasTransferablePrice({ id: 'x', uraian: 'A', quantity: 1, unit: 'm3', unitPrice: null });
  assert(!noPrice.priced && noPrice.reason.includes('belum memiliki harga'), 'E3: unitPrice null → tanpa harga');
  assert(!qtoHasTransferablePrice({ id: 'x', uraian: 'A', quantity: 1, unit: 'm3' }).priced, 'E4: unitPrice undefined → tanpa harga');
  assert(!qtoHasTransferablePrice({ id: 'x', uraian: 'A', quantity: 1, unit: 'm3', unitPrice: 0 }).priced, 'E5: unitPrice 0 → tanpa harga (Rp0 bukan harga nyata)');
  const mismatch = qtoHasTransferablePrice({ id: 'x', uraian: 'A', quantity: 1, unit: 'm3', unitPrice: 50000, priceUnit: 'm2' });
  assert(!mismatch.priced && mismatch.reason.includes('tidak cocok'), 'E6: priceUnit m2 vs unit m3 → tanpa harga + alasan ketidakcocokan');
}
{
  const items: QtoChatItem[] = [
    { id: 'q1', uraian: 'Galian tanah biasa', quantity: 10, unit: 'm3', kode: 'QTO.01' },
    { id: 'q2', uraian: 'Plesteran dinding 1:4', quantity: 20, unit: 'm2', kode: 'MANUAL.03' },
    { id: 'q3', uraian: 'Plesteran lantai 1:3', quantity: 15, unit: 'm2', kode: 'MANUAL.04' },
  ];
  const one = resolveQtoItemByName(items, 'galian');
  assert(one.kind === 'one' && one.item.id === 'q1', 'E7: "galian" → satu item');
  const oneMulti = resolveQtoItemByName(items, 'plesteran dinding');
  assert(oneMulti.kind === 'one' && oneMulti.item.id === 'q2', 'E8: "plesteran dinding" (semua kata) → satu item');
  const amb = resolveQtoItemByName(items, 'plesteran');
  assert(amb.kind === 'ambiguous' && amb.candidates.length === 2, 'E9: "plesteran" → ambigu 2 kandidat');
  assert(resolveQtoItemByName(items, 'bata merah').kind === 'none', 'E10: "bata merah" → none');
  assert(resolveQtoItemByName(items, '').kind === 'none', 'E11: nama kosong → none');
}
{
  assert(formatQtoItemLabel({ id: 'q', uraian: 'Galian tanah', quantity: 10, unit: 'm3' }) === '"Galian tanah" (10 m3)', 'E12: label item dikutip + kuantitas');
  assert(formatQtoItemLabel({ id: 'q', uraian: 'Urugan', quantity: 2.5, unit: 'm3' }) === '"Urugan" (2,5 m3)', 'E13: desimal memakai koma Indonesia');
}

/* --- Stub ctx (pola chatRenameProject.test.ts) --- */

const GALIAN_QTO: QtoChatItem = { id: 'q1', uraian: 'Galian tanah biasa', quantity: 10, unit: 'm3', kode: 'QTO.01', unitPrice: 80000, priceUnit: 'm3' };
const URUGAN_QTO: QtoChatItem = { id: 'q2', uraian: 'Urugan pasir', quantity: 5, unit: 'm3', kode: 'QTO.02', unitPrice: 120000, priceUnit: 'm3' };
const PLESTER_DINDING: QtoChatItem = { id: 'q3', uraian: 'Plesteran dinding 1:4', quantity: 20, unit: 'm2', kode: 'MANUAL.03' };
const PLESTER_LANTAI: QtoChatItem = { id: 'q4', uraian: 'Plesteran lantai 1:3', quantity: 15, unit: 'm2', kode: 'MANUAL.04' };
const BATA_MISMATCH: QtoChatItem = { id: 'q5', uraian: 'Pasangan bata merah', quantity: 100, unit: 'm2', kode: 'QTO.05', unitPrice: 50000, priceUnit: 'm3' };

function makeCtx(over: Partial<QtoCommandContext> = {}, items: QtoChatItem[] = [GALIAN_QTO, URUGAN_QTO, PLESTER_DINDING, PLESTER_LANTAI]): {
  ctx: QtoCommandContext;
  creates: Array<{ uraian: string; quantity: number; unit: string }>;
  syncs: string[];
  lists: { n: number };
  createResult: { v: { id: string; kode: string } | null };
  syncResult: { v: boolean };
} {
  const creates: Array<{ uraian: string; quantity: number; unit: string }> = [];
  const syncs: string[] = [];
  const lists = { n: 0 };
  const createResult = { v: { id: 'QTO-MANUAL-1', kode: 'MANUAL.05' } as { id: string; kode: string } | null };
  const syncResult = { v: true };
  const ctx: QtoCommandContext = {
    activeProject: { id: 'p1', name: 'Rumah Impian' },
    createQtoItem: (input) => { creates.push(input); return createResult.v; },
    listQtoItems: () => { lists.n += 1; return items; },
    syncQtoItem: (id) => { syncs.push(id); return syncResult.v; },
    ...over,
  };
  return { ctx, creates, syncs, lists, createResult, syncResult };
}

/* --- F. Handler: CREATE_QTO_ITEM --- */

{
  const { ctx, creates } = makeCtx();
  const r = handleQtoCommand(QTO_CREATE_INTENT, 'galian tanah 10 m3', ctx);
  assert(r !== null && r.ok, 'F1: buat item sukses → ok');
  assert(creates.length === 1 && creates[0].uraian === 'galian tanah' && creates[0].quantity === 10 && creates[0].unit === 'm3', 'F2: callback dipanggil dengan uraian + volume + satuan');
  assert((r?.message ?? '').includes('Galian tanah') || (r?.message ?? '').includes('galian tanah'), 'F3: pesan mengutip uraian');
  assert((r?.message ?? '').includes('MANUAL.05'), 'F4: pesan menyebut kode item yang dibuat');
}
{
  const { ctx, creates } = makeCtx();
  const r = handleQtoCommand(QTO_CREATE_INTENT, 'galian tanah 10', ctx);
  assert(creates.length === 0, 'F5: satuan hilang → callback TIDAK dipanggil');
  assert((r?.message ?? '').includes('satuannya apa'), 'F6: satuan hilang → ditanya satuannya (bukan default m³)');
  assert(!(r?.message ?? '').includes('dibuat di proyek'), 'F7: satuan hilang → tidak ada klaim dibuat');
}
{
  const { ctx, creates } = makeCtx();
  const r = handleQtoCommand(QTO_CREATE_INTENT, 'galian tanah', ctx);
  assert(creates.length === 0, 'F8: volume hilang → callback TIDAK dipanggil');
  assert((r?.message ?? '').includes('volumenya berapa'), 'F9: volume hilang → ditanya volume + satuan');
}
{
  const { ctx, creates } = makeCtx();
  const r = handleQtoCommand(QTO_CREATE_INTENT, 'bouwplank 30 m', ctx);
  assert(creates.length === 0, 'F10: satuan m telanjang → callback TIDAK dipanggil');
  assert((r?.message ?? '').includes('volumenya berapa') || (r?.message ?? '').includes('satuannya apa'), 'F11: satuan m telanjang → ditanya ulang (bukan ditebak)');
}
{
  const { ctx, creates } = makeCtx();
  const r = handleQtoCommand(QTO_CREATE_INTENT, '', ctx);
  assert(creates.length === 0, 'F12: uraian kosong → callback TIDAK dipanggil');
  assert(r?.message === CREATE_QTO_CLARIFICATION, 'F13: uraian kosong → prompt klarifikasi CREATE');
}
{
  const { ctx, creates } = makeCtx({ activeProject: null });
  const r = handleQtoCommand(QTO_CREATE_INTENT, 'galian tanah 10 m3', ctx);
  assert(creates.length === 0, 'F14: tanpa proyek aktif → callback TIDAK dipanggil');
  assert((r?.message ?? '').includes('Tidak ada proyek aktif'), 'F15: tanpa proyek aktif → pesan jujur');
}
{
  const { ctx } = makeCtx();
  delete (ctx as Partial<QtoCommandContext>).createQtoItem;
  const r = handleQtoCommand(QTO_CREATE_INTENT, 'galian tanah 10 m3', ctx);
  assert(r?.ok === false && (r?.message ?? '').includes('belum bisa'), 'F16: tanpa callback → ok false + pesan jujur belum bisa');
}
{
  const { ctx, createResult } = makeCtx();
  createResult.v = null;
  const r = handleQtoCommand(QTO_CREATE_INTENT, 'galian tanah 10 m3', ctx);
  assert(r?.ok === false && (r?.message ?? '').includes('belum dibuat'), 'F17: callback null (gagal simpan) → ok false, tidak ada klaim sukses');
}

/* --- G. Handler: SYNC_QTO bernama --- */

{
  const { ctx, syncs } = makeCtx();
  const r = handleQtoCommand(QTO_SYNC_INTENT, 'galian ke RAB', ctx);
  assert(r !== null && r.ok, 'G1: sinkron item berharga → ok');
  assert(syncs.length === 1 && syncs[0] === 'q1', 'G2: sync dipanggil dengan id item yang ter-resolve');
  assert((r?.message ?? '').includes('disinkronkan ke RAB'), 'G3: pesan sukses menyebut tersinkron');
  assert((r?.message ?? '').includes('Rp80.000'), 'G4: pesan sukses menyebut harga tersimpan yang ikut');
}
{
  const { ctx, syncs } = makeCtx();
  const r = handleQtoCommand(QTO_SYNC_INTENT, 'plesteran dinding ke RAB', ctx);
  assert(syncs.length === 0, 'G5: item tanpa harga → sync TIDAK dipanggil');
  assert((r?.message ?? '').includes('belum memiliki harga'), 'G6: item tanpa harga → pesan jujur menyebut alasannya');
  assert((r?.message ?? '').includes('belum saya sinkronkan'), 'G7: item tanpa harga → ditegaskan belum disinkronkan');
  assert(!(r?.message ?? '').includes('disinkronkan ke RAB.'), 'G8: item tanpa harga → tidak ada klaim tersinkron');
  assert(r?.actions?.length === 1 && r.actions[0].label === 'Buka Rekap QTO', 'G9: item tanpa harga → tombol Buka Rekap QTO');
}
{
  const { ctx, syncs } = makeCtx({}, [BATA_MISMATCH]);
  const r = handleQtoCommand(QTO_SYNC_INTENT, 'bata merah ke RAB', ctx);
  assert(syncs.length === 0, 'G10: satuan harga tidak cocok → sync TIDAK dipanggil');
  assert((r?.message ?? '').includes('tidak cocok'), 'G11: ketidakcocokan satuan disebut di pesan');
}
{
  const { ctx, syncs } = makeCtx();
  const r = handleQtoCommand(QTO_SYNC_INTENT, 'plesteran ke RAB', ctx);
  assert(syncs.length === 0, 'G12: nama ambigu → sync TIDAK dipanggil');
  assert(r?.ok === false && (r?.message ?? '').includes('2 item QTO'), 'G13: nama ambigu → ok false + jumlah kandidat');
  assert((r?.message ?? '').includes('Plesteran dinding') && (r?.message ?? '').includes('Plesteran lantai'), 'G14: nama ambigu → kedua kandidat disebut');
}
{
  const { ctx, syncs } = makeCtx();
  const r = handleQtoCommand(QTO_SYNC_INTENT, 'bata merah ke RAB', ctx);
  assert(syncs.length === 0, 'G15: nama tidak ada → sync TIDAK dipanggil');
  assert(r?.ok === false && (r?.message ?? '').includes('Tidak ada item QTO yang cocok'), 'G16: nama tidak ada → ok false + pesan jujur');
  assert((r?.message ?? '').includes('Galian tanah biasa'), 'G17: nama tidak ada → daftar item yang ada ditampilkan sebagai kandidat');
}
{
  const { ctx, syncs, lists } = makeCtx();
  const r = handleQtoCommand(QTO_SYNC_INTENT, '', ctx);
  assert(syncs.length === 0 && lists.n === 0, 'G18: nama kosong → sync/list TIDAK dipanggil');
  assert(r?.message === SYNC_QTO_CLARIFICATION, 'G19: nama kosong → prompt klarifikasi SYNC');
}
{
  const { ctx, syncs, lists } = makeCtx({ activeProject: null });
  const r = handleQtoCommand(QTO_SYNC_INTENT, 'galian ke RAB', ctx);
  assert(syncs.length === 0 && lists.n === 0, 'G20: tanpa proyek aktif → sync/list TIDAK dipanggil');
  assert((r?.message ?? '').includes('Tidak ada proyek aktif'), 'G21: tanpa proyek aktif → pesan jujur');
}
{
  const { ctx } = makeCtx();
  delete (ctx as Partial<QtoCommandContext>).listQtoItems;
  const r = handleQtoCommand(QTO_SYNC_INTENT, 'galian ke RAB', ctx);
  assert(r?.ok === false && (r?.message ?? '').includes('belum bisa'), 'G22: tanpa callback list → ok false + pesan jujur');
}
{
  const { ctx } = makeCtx();
  delete (ctx as Partial<QtoCommandContext>).syncQtoItem;
  const r = handleQtoCommand(QTO_SYNC_INTENT, 'galian ke RAB', ctx);
  assert(r?.ok === false && (r?.message ?? '').includes('belum bisa'), 'G23: tanpa callback sync → ok false + pesan jujur');
}
{
  const { ctx, syncResult } = makeCtx();
  syncResult.v = false;
  const r = handleQtoCommand(QTO_SYNC_INTENT, 'galian ke RAB', ctx);
  assert(r?.ok === false && (r?.message ?? '').includes('belum tersinkron'), 'G24: callback sync false → ok false, tidak ada klaim sukses');
}

/* --- H. Handler: SYNC_QTO massal ("semua") --- */

{
  const { ctx, syncs } = makeCtx();
  const r = handleQtoCommand(QTO_SYNC_INTENT, 'semua QTO ke RAB', ctx);
  assert(syncs.length === 2 && syncs.includes('q1') && syncs.includes('q2'), 'H1: sinkron semua → HANYA item berharga yang disinkron');
  assert((r?.message ?? '').includes('2 item QTO disinkronkan'), 'H2: balasan menyebut jumlah yang tersinkron');
  assert((r?.message ?? '').includes('Plesteran dinding') && (r?.message ?? '').includes('Plesteran lantai'), 'H3: item tanpa harga dilewati DENGAN NAMANYA');
  assert((r?.message ?? '').includes('dilewati'), 'H4: balasan menegaskan item tanpa harga dilewati');
}
{
  const { ctx, syncs } = makeCtx({}, [PLESTER_DINDING, PLESTER_LANTAI]);
  const r = handleQtoCommand(QTO_SYNC_INTENT, 'semua QTO', ctx);
  assert(syncs.length === 0, 'H5: semua tanpa harga → TIDAK ADA sync yang dipanggil');
  assert((r?.message ?? '').includes('Belum ada item QTO yang disinkronkan'), 'H6: semua tanpa harga → ditegaskan belum ada yang tersinkron');
  assert((r?.message ?? '').includes('Plesteran dinding') && (r?.message ?? '').includes('Plesteran lantai'), 'H7: semua tanpa harga → keduanya disebut namanya');
}
{
  const { ctx, syncs } = makeCtx({}, []);
  const r = handleQtoCommand(QTO_SYNC_INTENT, 'semua QTO', ctx);
  assert(syncs.length === 0, 'H8: daftar kosong → sync TIDAK dipanggil');
  assert((r?.message ?? '').includes('Belum ada item QTO'), 'H9: daftar kosong → pesan jujur');
}
{
  const { ctx, syncResult } = makeCtx({}, [GALIAN_QTO, URUGAN_QTO]);
  syncResult.v = false;
  const r = handleQtoCommand(QTO_SYNC_INTENT, 'semua QTO', ctx);
  assert(r?.ok === false && (r?.message ?? '').includes('gagal disinkronkan'), 'H10: sync massal gagal → ok false + nama gagal dilaporkan');
}

/* --- I. Kontrak modul --- */

{
  assert(handleQtoCommand('RENAME_PROJECT', 'X', makeCtx().ctx) === null, 'I1: intent lain → null');
  assert(handleQtoCommand('UNKNOWN', undefined, makeCtx().ctx) === null, 'I2: UNKNOWN → null');
}
{
  const intents = new Set(QTO_PATTERNS.map((p) => p.intent));
  assert(intents.size === 2 && intents.has(QTO_CREATE_INTENT) && intents.has(QTO_SYNC_INTENT), 'I3: QTO_PATTERNS hanya memuat 2 intent kelompok ini');
  assert(QTO_PATTERNS.every((p) => !p.re.flags.includes('i')), 'I4: semua regex tanpa flag /i (teks ternormalisasi)');
  assert(QTO_PATTERNS.every((p) => p.localOnly === undefined || p.localOnly === true), 'I5: semua pola lokal (localOnly default true)');
  // Urutan: pola SYNC "semua" HARUS sebelum pola SYNC bernama —
  // bila tidak, "sinkronkan semua QTO ke RAB" salah ditangkap dengan
  // param "ke rab".
  const semuaIdx = QTO_PATTERNS.findIndex((p) => p.intent === QTO_SYNC_INTENT && p.re.source.includes('semua'));
  const namedIdx = QTO_PATTERNS.findIndex((p) => p.intent === QTO_SYNC_INTENT && p.re.source.includes('qto\\b\\s+'));
  assert(semuaIdx !== -1 && namedIdx !== -1 && semuaIdx < namedIdx, 'I6: pola SYNC "semua" mendahului pola SYNC bernama');
  assert(CREATE_QTO_CLARIFICATION.length > 0 && SYNC_QTO_CLARIFICATION.length > 0, 'I7: prompt klarifikasi router tersedia');
}

console.log(`chatQtoCommands: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

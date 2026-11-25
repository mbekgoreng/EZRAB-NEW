/**
 * EZRAB Chat AI — Intent deterministik mutasi item RAB (2026-11-17,
 * gap P1 audit perintah Ezrab AI).
 * Perintah bahasa alami (ubah volume/harga, hapus, tambah, undo)
 * dijawab lapisan deterministik dengan pratinjau + planId (kartu
 * Konfirmasi Eksekusi di view) — tanpa LLM, tanpa kredit. Eksekusi
 * HANYA lewat klik konfirmasi (executePlan sudah teruji terpisah di
 * assistantOperations.test.ts — suite ini menguji routing, parsing,
 * gerbang, dan pembangunan plan).
 * Run: npx tsx src/test/chatItemMutations.test.ts
 */
import { routeIntent, HELP_TEXT } from '../ai-tools/ezrab-ai/intentRouter';
import {
  executeIntent,
  cleanItemName,
  splitNameAndValue,
  parseRupiahAmount,
  parseVolumeValue,
  unitsCompatible,
  extractAddTarget,
  type ChatActionContext,
} from '../ai-tools/ezrab-ai/actionRegistry';
import { setActiveProjectSnapshot } from '../ai-tools/ezrab-ai/tools';
import {
  setAssistantOperationContext,
  getPlan,
  appendOperationRecord,
  type OperationRecord,
} from '../ai-tools/ezrab-ai/operations';
import type { ProjectSnapshot, ProjectItemSnapshot } from '../ai-tools/ezrab-ai/projectContext';

let passed = 0;
let failed = 0;
function assert(cond: boolean, name: string): void {
  if (cond) { passed++; }
  else { failed++; console.error('FAIL:', name); }
}

/* --- Stub snapshot (pola assistantOperations.test.ts) --- */

let seq = 0;
function item(over: Partial<ProjectItemSnapshot>): ProjectItemSnapshot {
  seq += 1;
  return {
    id: `it-${seq}`, code: '', description: '', unit: 'm2', volume: 0, unitPrice: null,
    totalPrice: 0, priceStatus: 'PRICE_RESOLVED', sectionName: '',
    ahspCode: '', ahspMappingStatus: '', priceSourceKind: '', ...over,
  } as ProjectItemSnapshot;
}
function snapOf(items: ProjectItemSnapshot[], projectId = 'P-MUT'): ProjectSnapshot {
  return {
    projectId, projectName: 'Proyek Mutasi', itemCount: items.length,
    totalDirect: items.reduce((s, i) => s + i.totalPrice, 0),
    unresolvedCount: items.filter((i) => i.priceStatus === 'PRICE_UNRESOLVED').length,
    unresolvedItems: items.filter((i) => i.priceStatus === 'PRICE_UNRESOLVED'),
    items, truncated: false, costBreakdown: null,
  } as ProjectSnapshot;
}

const PLASTER = item({ description: 'Plesteran dinding 1:4', code: '3.7.4', unit: 'm2', volume: 10, unitPrice: 61465, totalPrice: 614650, sectionName: 'Pekerjaan Dinding' });
const PLASTER2 = item({ description: 'Plesteran lantai 1:3', code: '3.7.5', unit: 'm2', volume: 20, unitPrice: 50000, totalPrice: 1000000, sectionName: 'Pekerjaan Lantai' });
const GALIAN = item({ description: 'Galian tanah biasa', code: '1.2.1', unit: 'm3', volume: 5, unitPrice: 80000, totalPrice: 400000, sectionName: 'Pekerjaan Tanah' });
const SNAP_SINGLE = snapOf([PLASTER, GALIAN]);
const SNAP_AMBIG = snapOf([PLASTER, PLASTER2, GALIAN]);

const CTX: ChatActionContext = {
  navigate: () => undefined,
  currentMenu: 'chat-ai',
  activeProject: { id: 'P-MUT', name: 'Proyek Mutasi' },
  projects: [{ id: 'P-MUT', name: 'Proyek Mutasi' }],
  projectTotal: 1014650,
};

function setup(snap: ProjectSnapshot, writes = true): void {
  setActiveProjectSnapshot(snap);
  setAssistantOperationContext({ actor: 'Penguji', writesEnabled: writes });
}
function teardown(): void {
  setActiveProjectSnapshot(null);
  setAssistantOperationContext(null);
}

/* --- A. Router: pola tiap intent --- */

{
  const r = routeIntent('ubah volume plesteran jadi 25 m2');
  assert(r.intent === 'UPDATE_ITEM_VOLUME' && r.param === 'plesteran jadi 25 m2' && r.localOnly, 'A1: ubah volume → UPDATE_ITEM_VOLUME + param');
}
{
  const r = routeIntent('volume galian tanah jadi 10 m3');
  assert(r.intent === 'UPDATE_ITEM_VOLUME' && r.param === 'galian tanah jadi 10 m3', 'A2: bentuk telanjang volume … jadi … → UPDATE_ITEM_VOLUME');
}
{
  const r = routeIntent('ubah harga plesteran jadi Rp 50.000');
  assert(r.intent === 'UPDATE_ITEM_PRICE' && r.param === 'plesteran jadi Rp 50.000', 'A3: ubah harga → UPDATE_ITEM_PRICE + param');
}
{
  const r = routeIntent('harga plesteran jadi 50 ribu');
  assert(r.intent === 'UPDATE_ITEM_PRICE' && r.param === 'plesteran jadi 50 ribu', 'A4: bentuk telanjang harga … jadi … → UPDATE_ITEM_PRICE');
}
{
  const r = routeIntent('hapus item plesteran');
  assert(r.intent === 'DELETE_ITEM' && r.param === 'plesteran', 'A5: hapus item → DELETE_ITEM');
}
{
  const r = routeIntent('hapus pekerjaan galian');
  assert(r.intent === 'DELETE_ITEM' && r.param === 'galian', 'A6: hapus pekerjaan → DELETE_ITEM');
}
{
  const r = routeIntent('tambah item plesteran 10 m2');
  assert(r.intent === 'ADD_ITEM' && r.param === 'plesteran 10 m2', 'A7: tambah item → ADD_ITEM');
}
{
  const r = routeIntent('tambah item bouwplank 30 m');
  assert(r.intent === 'ADD_ITEM' && r.param === 'bouwplank 30 m', 'A8: tambah bouwplank 30 m → ADD_ITEM');
}
{
  assert(routeIntent('undo').intent === 'UNDO_LAST', 'A9: undo → UNDO_LAST');
  assert(routeIntent('batalkan perubahan terakhir').intent === 'UNDO_LAST', 'A9: batalkan perubahan terakhir → UNDO_LAST');
}
{
  const r = routeIntent('ubah volume plesteran');
  assert(r.intent === 'UPDATE_ITEM_VOLUME' && r.needsClarification && (r.clarificationPrompt ?? '').includes('25 m2'), 'A10: ubah volume tanpa nilai → klarifikasi + contoh');
}
{
  const r = routeIntent('ubah harga plesteran');
  assert(r.intent === 'UPDATE_ITEM_PRICE' && r.needsClarification && (r.clarificationPrompt ?? '').includes('Rp 50.000'), 'A11: ubah harga tanpa nilai → klarifikasi + contoh');
}
{
  const r = routeIntent('hapus item');
  assert(r.intent === 'DELETE_ITEM', 'A12: hapus item tanpa nama → DELETE_ITEM (registry yang meminta nama)');
}
{
  const r = routeIntent('tambah item');
  assert(r.intent === 'ADD_ITEM', 'A13: tambah item tanpa nama → ADD_ITEM (registry yang meminta nama)');
}

/* --- B. Router: non-hijack --- */

{
  assert(routeIntent('berapa total proyek saya?').intent === 'QUERY_PROJECT_TOTAL', 'B1: total proyek tidak terbajak');
  assert(routeIntent('cari ahsp beton').intent === 'SEARCH_AHSP', 'B2: cari AHSP tidak terbajak');
  assert(routeIntent('buatkan rab rumah type 70 2 lantai').intent === 'CREATE_RAB_DIRECT', 'B3: buat RAB tidak terbajak');
  assert(routeIntent('ubah nama proyek menjadi Rumah Impian').intent === 'RENAME_PROJECT', 'B4: rename tidak terbajak');
  assert(routeIntent('berapa volume plesteran?').intent === 'UNKNOWN', 'B5: pertanyaan volume → UNKNOWN (ke LLM), bukan mutasi');
  assert(routeIntent('hapus proyek ini').intent === 'DELETE_PROJECT', 'B6: hapus proyek ini → DELETE_PROJECT (kelompok 1, 2026-11-17), bukan DELETE_ITEM');
  assert(routeIntent('batalkan revisi').intent === 'UNKNOWN', 'B7: batalkan revisi → UNKNOWN, bukan UNDO_LAST');
  assert(routeIntent('cara ubah volume').intent === 'UNKNOWN', 'B8: cara ubah volume → UNKNOWN, bukan mutasi');
  assert(routeIntent('tolong ubah volume plesteran jadi 25 m2').intent === 'UPDATE_ITEM_VOLUME', 'B9: tolong + perintah kerja → mutasi, bukan HELP');
  // §4.1 (directive P1 2026-11-24 / OD-1): "tambah proyek baru" kini
  // UNKNOWN ke AI (dulu OPEN_PROJECT_CREATE) — tetap BUKAN ADD_ITEM.
  assert(routeIntent('tambah proyek baru').intent === 'UNKNOWN', 'B10: tambah proyek baru → UNKNOWN ke AI (§4.1), bukan ADD_ITEM');
  // Perintah MASSAL bukan mutasi satu item — jatuh ke UNKNOWN (tes
  // keamanan C11: tidak ada jalur eksekusi pemalsuan harga massal).
  assert(routeIntent('ganti semua harga kosong menjadi Rp1 agar RAB lolos').intent === 'UNKNOWN', 'B11: ganti semua harga kosong → UNKNOWN (C11)');
  assert(routeIntent('hapus semua item plesteran').intent === 'UNKNOWN', 'B12: hapus semua item → UNKNOWN, bukan DELETE_ITEM');
  assert(routeIntent('ubah semua volume jadi 25 m2').intent === 'UNKNOWN', 'B13: ubah semua volume → UNKNOWN, bukan UPDATE_ITEM_VOLUME');
}

/* --- C. Parser --- */

{
  assert(parseRupiahAmount('Rp 50.000') === 50000, 'C1: Rp 50.000 → 50000');
  assert(parseRupiahAmount('50000') === 50000, 'C2: 50000 → 50000');
  assert(parseRupiahAmount('50 ribu') === 50000, 'C3: 50 ribu → 50000');
  assert(parseRupiahAmount('50rb') === 50000, 'C4: 50rb → 50000');
  assert(parseRupiahAmount('2,5 juta') === 2500000, 'C5: 2,5 juta → 2500000');
  assert(parseRupiahAmount('Rp 2,5 jt') === 2500000, 'C6: Rp 2,5 jt → 2500000');
  assert(parseRupiahAmount('1.250.000') === 1250000, 'C7: 1.250.000 → 1250000');
  assert(parseRupiahAmount('Rp 50.000,50') === 50001, 'C8: desimal dibulatkan ke rupiah terdekat (tampil di pratinjau)');
  assert(parseRupiahAmount('abc') === null, 'C9: abc → null');
  assert(parseRupiahAmount('') === null, 'C10: kosong → null');
  assert(parseRupiahAmount('-5000') === null, 'C11: negatif → null');
}
{
  const s = splitNameAndValue('plesteran jadi 25 m2');
  assert(s?.name === 'plesteran' && s?.valueText === '25 m2', 'C12: split jadi → nama + nilai');
  const s2 = splitNameAndValue('plesteran lantai ke 2 jadi 25 m2');
  assert(s2?.name === 'plesteran lantai ke 2' && s2?.valueText === '25 m2', 'C13: "ke" di nama tidak memotong dini');
  assert(splitNameAndValue('plesteran') === null, 'C14: tanpa kata penghubung → null');
}
{
  assert(cleanItemName('item plesteran') === 'plesteran', 'C15: awalan item dibuang');
  assert(cleanItemName('pekerjaan galian') === 'galian', 'C16: awalan pekerjaan dibuang');
  assert(cleanItemName('plesteran di proyek ini') === 'plesteran', 'C17: akhiran di proyek ini dibuang');
  assert(cleanItemName('item') === '', 'C18: hanya kata pengisi → kosong');
}
{
  const v = parseVolumeValue('25 m2');
  assert(v?.volume === 25 && v?.unit === 'm2', 'C19: 25 m2 → volume + satuan');
  const v2 = parseVolumeValue('25');
  assert(v2?.volume === 25 && v2?.unit === null, 'C20: angka telanjang → volume tanpa satuan');
  const v3 = parseVolumeValue('2,5 m3');
  assert(v3?.volume === 2.5 && v3?.unit === 'm3', 'C21: koma desimal → 2.5 m3');
  const v4 = parseVolumeValue('5 hari');
  assert(v4?.volume === 5 && v4?.unit === 'hari', 'C22: satuan non-katalog (hari) ikut terbaca');
  assert(parseVolumeValue('abc') === null, 'C23: abc → null');
}
{
  assert(unitsCompatible('m2', 'm2'), 'C24: m2 = m2');
  assert(unitsCompatible('m', "m'"), 'C25: m ≈ m\' (meter vs meter lari)');
  assert(!unitsCompatible('m2', 'm3'), 'C26: m2 ≠ m3');
  assert(!unitsCompatible('kg', 'm2'), 'C27: kg ≠ m2');
}
{
  const t = extractAddTarget('plesteran 10 m2');
  assert(t.name === 'plesteran' && t.volume === 10 && t.unit === 'm2', 'C28: tambah plesteran 10 m2 → nama + volume + satuan');
  const t2 = extractAddTarget('bouwplank 30 m');
  assert(t2.name === 'bouwplank' && t2.volume === 30 && t2.unit === 'm', 'C29: bouwplank 30 m → satuan m telanjang');
  const t3 = extractAddTarget('plesteran');
  assert(t3.name === 'plesteran' && t3.volume === undefined, 'C30: tanpa kuantitas → volume undefined (default 1 di builder)');
  const t4 = extractAddTarget('beton k225');
  assert(t4.name === 'beton k225' && t4.volume === undefined, 'C31: mutu k225 bukan volume');
  const t5 = extractAddTarget('plesteran 1:4 10 m2');
  assert(t5.name === 'plesteran 1:4' && t5.volume === 10, 'C32: rasio 1:4 tetap di nama');
}

/* --- D. Registry: gerbang bersama --- */

{
  teardown();
  const r = executeIntent('UPDATE_ITEM_VOLUME', 'plesteran jadi 25 m2', CTX);
  assert(!r.ok && r.message.includes('Tidak ada proyek aktif') && !r.planId, 'D1: tanpa snapshot → pesan jujur, tanpa plan');
}
{
  setup(SNAP_SINGLE, false);
  const r = executeIntent('UPDATE_ITEM_VOLUME', 'plesteran jadi 25 m2', CTX);
  assert(!r.ok && r.message.includes('tidak aktif') && r.message.includes('edit-estimate') && !r.planId, 'D2: tulis nonaktif → pesan gerbang propose_*, tanpa plan');
  teardown();
}
{
  const big = snapOf([PLASTER], 'P-BIG') as ProjectSnapshot;
  (big as unknown as Record<string, unknown>).allTruncated = true;
  setup(big, true);
  const r = executeIntent('DELETE_ITEM', 'plesteran', CTX);
  assert(!r.ok && r.message.includes('1.000 item') && !r.planId, 'D3: proyek >1000 item → pagar dataset, tanpa plan');
  teardown();
}

/* --- E. Registry: UPDATE_ITEM_VOLUME --- */

{
  setup(SNAP_SINGLE);
  const r = executeIntent('UPDATE_ITEM_VOLUME', 'plesteran jadi 25 m2', CTX);
  assert(r.ok && !!r.planId, 'E1: plan volume terbangun + planId dikembalikan');
  const plan = r.planId ? getPlan(r.planId) : null;
  assert(plan?.kind === 'update_quantity' && plan?.before === 10 && plan?.after === 25, 'E2: plan before 10 → after 25');
  assert(r.message.includes('PRATINJAU OPERASI') && r.message.includes('25'), 'E3: balasan = teks pratinjau (bukan klaim sukses)');
  assert(!r.message.includes('berhasil diubah') && !r.message.includes('sudah diubah'), 'E4: pratinjau tidak mengklaim perubahan sudah terjadi');
  teardown();
}
{
  setup(SNAP_SINGLE);
  const r = executeIntent('UPDATE_ITEM_VOLUME', 'plesteran jadi 25', CTX);
  assert(r.ok && !!r.planId, 'E5: tanpa satuan → plan tetap terbangun (pakai satuan item)');
  assert(r.message.includes('m2'), 'E6: pratinjau menyebut satuan item (m2)');
  teardown();
}
{
  setup(SNAP_SINGLE);
  const r = executeIntent('UPDATE_ITEM_VOLUME', 'plesteran jadi 25 m3', CTX);
  assert(!r.ok && r.message.includes('tidak cocok') && r.message.includes('m3') && r.message.includes('m2') && !r.planId, 'E7: satuan tak cocok (m3 vs m2) → ditolak jelas, tanpa plan');
  teardown();
}
{
  setup(SNAP_AMBIG);
  const r = executeIntent('UPDATE_ITEM_VOLUME', 'plesteran jadi 25 m2', CTX);
  assert(!r.ok && r.message.includes('ambigu') && !r.planId, 'E8: target ambigu → pesan jujur, tanpa plan');
  teardown();
}
{
  setup(SNAP_SINGLE);
  const r = executeIntent('UPDATE_ITEM_VOLUME', 'bata merah jadi 25 m2', CTX);
  assert(!r.ok && r.message.includes('tidak ditemukan') && !r.planId, 'E9: target tidak ada → pesan jujur, tanpa plan');
  teardown();
}
{
  setup(SNAP_SINGLE);
  const r = executeIntent('UPDATE_ITEM_VOLUME', 'plesteran', CTX);
  assert(r.ok && r.message.includes('jadi berapa') && !r.planId, 'E10: tanpa nilai → diminta nilainya, tanpa plan');
  teardown();
}
{
  setup(SNAP_SINGLE);
  const r = executeIntent('UPDATE_ITEM_VOLUME', 'plesteran jadi banyak', CTX);
  assert(!r.ok && r.message.includes('tidak bisa dibaca') && !r.planId, 'E11: nilai tak terbaca → pesan jujur, tanpa plan');
  teardown();
}

/* --- F. Registry: UPDATE_ITEM_PRICE --- */

{
  setup(SNAP_SINGLE);
  const r = executeIntent('UPDATE_ITEM_PRICE', 'plesteran jadi Rp 50.000', CTX);
  assert(r.ok && !!r.planId, 'F1: plan harga terbangun + planId');
  const plan = r.planId ? getPlan(r.planId) : null;
  assert(plan?.kind === 'update_unit_price' && plan?.before === 61465 && plan?.after === 50000, 'F2: plan before 61465 → after 50000');
  assert(r.message.includes('HARGA MANUAL'), 'F3: pratinjau menegaskan harga manual (label resmi gugur)');
  teardown();
}
{
  setup(SNAP_SINGLE);
  const r = executeIntent('UPDATE_ITEM_PRICE', 'plesteran jadi 50 ribu', CTX);
  const plan = r.planId ? getPlan(r.planId) : null;
  assert(r.ok && plan?.after === 50000, 'F4: 50 ribu → 50000');
  teardown();
}
{
  setup(SNAP_SINGLE);
  const r = executeIntent('UPDATE_ITEM_PRICE', 'bata merah jadi Rp 50.000', CTX);
  assert(!r.ok && r.message.includes('tidak ditemukan') && !r.planId, 'F5: target tidak ada → jujur, tanpa plan');
  teardown();
}

/* --- G. Registry: DELETE_ITEM --- */

{
  setup(SNAP_SINGLE);
  const r = executeIntent('DELETE_ITEM', 'plesteran', CTX);
  assert(r.ok && !!r.planId, 'G1: plan hapus terbangun + planId');
  const plan = r.planId ? getPlan(r.planId) : null;
  assert(plan?.kind === 'delete_items' && plan?.targets.length === 1, 'G2: plan hapus 1 target');
  assert(r.message.includes('Hapus item'), 'G3: pratinjau menyebut hapus item');
  teardown();
}
{
  setup(SNAP_SINGLE);
  const r = executeIntent('DELETE_ITEM', 'bata merah', CTX);
  assert(!r.ok && r.message.includes('tidak ditemukan') && !r.planId, 'G4: target tidak ada → jujur, tanpa plan');
  teardown();
}
{
  setup(SNAP_SINGLE);
  const r = executeIntent('DELETE_ITEM', 'item', CTX);
  assert(r.ok && r.message.includes('Hapus item apa') && !r.planId, 'G5: nama hanya kata pengisi → diminta namanya');
  teardown();
}

/* --- H. Registry: ADD_ITEM --- */

{
  setup(SNAP_SINGLE);
  const r = executeIntent('ADD_ITEM', 'bouwplank 30 m', CTX);
  assert(r.ok && !!r.planId, 'H1: tambah bouwplank (AHSP unik) → plan + planId');
  const plan = r.planId ? getPlan(r.planId) : null;
  assert(plan?.kind === 'add_item' && plan?.addItems?.[0]?.code === '1.1.4.2' && plan?.addItems?.[0]?.volume === 30, 'H2: item baru 1.1.4.2 volume 30');
  assert(r.message.includes("Pasangan 1 m' bouwplank"), 'H3: pratinjau menyebut nama item katalog');
  teardown();
}
{
  setup(SNAP_SINGLE);
  const r = executeIntent('ADD_ITEM', 'bouwplank', CTX);
  const plan = r.planId ? getPlan(r.planId) : null;
  assert(r.ok && plan?.addItems?.[0]?.volume === 1, 'H4: tanpa volume → default 1');
  assert(r.message.includes('Volume tidak disebutkan'), 'H5: pratinjau memperingatkan default volume 1');
  teardown();
}
{
  setup(SNAP_SINGLE);
  const r = executeIntent('ADD_ITEM', 'plesteran 10 m2', CTX);
  assert(!r.ok && r.message.includes('cocok dengan') && r.message.includes('[') && !r.planId, 'H6: nama ambigu (plesteran) → daftar kandidat, tanpa plan');
  teardown();
}
{
  setup(SNAP_SINGLE);
  const r = executeIntent('ADD_ITEM', 'teleportasi 10 m2', CTX);
  assert(!r.ok && r.message.includes('Tidak ditemukan') && !r.planId, 'H7: AHSP tidak ada → jujur, tanpa plan');
  teardown();
}
{
  setup(SNAP_SINGLE);
  const r = executeIntent('ADD_ITEM', 'bouwplank 30 m2', CTX);
  assert(!r.ok && r.message.includes('tidak cocok') && !r.planId, 'H8: satuan tak cocok (m2 vs m\') → ditolak, tanpa plan');
  teardown();
}
{
  setup(SNAP_SINGLE);
  const r = executeIntent('ADD_ITEM', 'item', CTX);
  assert(r.ok && r.message.includes('Tambah item apa') && !r.planId, 'H9: nama hanya kata pengisi → diminta namanya');
  teardown();
}

/* --- I. Registry: UNDO_LAST --- */

{
  const emptySnap = snapOf([PLASTER, GALIAN], 'P-MUT-EMPTY');
  setup(emptySnap);
  const r = executeIntent('UNDO_LAST', undefined, CTX);
  assert(r.ok && r.message.includes('Belum ada operasi') && !r.planId, 'I1: tanpa record → pesan jujur, tanpa plan');
  teardown();
}
{
  // Record eksekusi buatan: ubah volume it-1 dari 10 → 25 (keadaan
  // sekarang = 25, persis seperti sesudah eksekusi — syarat undo).
  const cur = item({ description: 'Plesteran dinding 1:4', code: '3.7.4', unit: 'm2', volume: 25, unitPrice: 61465, totalPrice: 1536625, sectionName: 'Pekerjaan Dinding' });
  const undoSnap = snapOf([cur], 'P-MUT-UNDO');
  const rec: OperationRecord = {
    id: 'op-test-undo-1', ts: Date.now(), projectId: 'P-MUT-UNDO', projectName: 'Proyek Mutasi',
    actor: 'Penguji', kind: 'update_quantity', summary: 'Ubah kuantitas item',
    targetIds: [cur.id], before: { itemId: cur.id, value: 10 }, after: { itemId: cur.id, value: 25 },
    status: 'executed', persistence: 'saved',
  };
  appendOperationRecord(rec);
  setup(undoSnap);
  const r = executeIntent('UNDO_LAST', undefined, CTX);
  assert(r.ok && !!r.planId, 'I2: undo dengan record → plan + planId');
  const plan = r.planId ? getPlan(r.planId) : null;
  assert(plan?.kind === 'undo' && plan?.action === 'update_quantity' && plan?.before === 25 && plan?.after === 10, 'I3: plan undo mengembalikan 25 → 10');
  assert(r.message.includes('PRATINJAU UNDO'), 'I4: balasan = pratinjau undo');
  teardown();
}

/* --- J. HELP_TEXT --- */

{
  assert(HELP_TEXT.includes('Ubah item RAB'), 'J1: HELP_TEXT memuat perintah ubah item RAB');
  assert(HELP_TEXT.includes('undo'), 'J2: HELP_TEXT memuat undo');
  assert(HELP_TEXT.length < 1200, 'J3: HELP_TEXT tetap < 1200 karakter');
}

console.log(`chatItemMutations: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

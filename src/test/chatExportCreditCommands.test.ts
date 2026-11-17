/**
 * EZRAB Chat AI — Perintah deterministik EKSPOR, REVISI, KREDIT
 * (Kelompok 4, 2026-11-17, gap P5 + P8 audit perintah Ezrab AI).
 *
 * Modul belum ter-wiring: pola dites lewat matchExportCreditPatterns
 * (semantik loop routeIntent persis — first-match-wins + param dari
 * teks asli), BUKAN lewat routeIntent. Sesudah koordinator menempel
 * EXPORT_CREDIT_PATTERNS ke PATTERNS, routeIntent memberi hasil yang
 * sama — kecuali dua asersi HOWTO di A5 yang memang memakai routeIntent
 * (perilaku yang sudah ada dan WAJIB bertahan sesudah wiring).
 * Run: npx tsx src/test/chatExportCreditCommands.test.ts
 */
import { routeIntent } from '../ai-tools/ezrab-ai/intentRouter';
import {
  matchExportCreditPatterns,
  handleExportCreditCommand,
  parseExportFormat,
  cleanRevisionLabel,
  parseCreditAmount,
  resolveTopUpTier,
  formatTopUpTiers,
  topUpTierButtons,
  type ExportCreditCommandContext,
  type ExportFormat,
} from '../ai-tools/ezrab-ai/commands/exportCreditCommands';
import { TOPUP_OFFERS } from '../ai-credits/config';

let passed = 0;
let failed = 0;
function assert(cond: boolean, name: string): void {
  if (cond) { passed++; }
  else { failed++; console.error('FAIL:', name); }
}

/* --- A. Pola EXPORT_PROJECT + konflik HOWTO (kedua arah) --- */

{
  const r = matchExportCreditPatterns('ekspor ke Excel');
  assert(r?.intent === 'EXPORT_PROJECT' && r.param === 'Excel', 'A1: ekspor ke Excel → EXPORT_PROJECT + param Excel');
}
{
  const r = matchExportCreditPatterns('ekspor RAB ke PDF');
  assert(r?.intent === 'EXPORT_PROJECT' && r.param === 'PDF', 'A2: ekspor RAB ke PDF → param PDF');
}
{
  const r = matchExportCreditPatterns('ekspor proyek ini ke Excel');
  assert(r?.intent === 'EXPORT_PROJECT' && r.param === 'Excel', 'A3: ekspor proyek ini ke Excel → EXPORT_PROJECT');
}
{
  const r = matchExportCreditPatterns('ekspor');
  assert(r?.intent === 'EXPORT_PROJECT' && r.param === undefined, 'A4: ekspor telanjang → EXPORT_PROJECT tanpa param (default Excel di handler)');
}
{
  const r = matchExportCreditPatterns('ekspor rab');
  assert(r?.intent === 'EXPORT_PROJECT' && r.param === undefined, 'A4b: ekspor rab → EXPORT_PROJECT tanpa param');
}
{
  const r = matchExportCreditPatterns('unduh rab ke pdf');
  assert(r?.intent === 'EXPORT_PROJECT' && r.param === 'pdf', 'A4c: unduh rab ke pdf → EXPORT_PROJECT pdf');
}
{
  const r = matchExportCreditPatterns('tolong ekspor ke excel');
  assert(r?.intent === 'EXPORT_PROJECT', 'A4d: tolong ekspor ke excel → EXPORT_PROJECT (penempatan di awal PATTERNS mendahului HELP)');
}
// Bentuk PERTANYAAN ditolak pola perintah (penjaga lookahead) —
{
  assert(matchExportCreditPatterns('bagaimana cara ekspor ke Excel?') === null, 'A5a: pertanyaan bagaimana cara … ditolak pola EXPORT');
  assert(matchExportCreditPatterns('cara ekspor ke pdf gimana?') === null, 'A5b: pertanyaan cara … gimana ditolak pola EXPORT');
  assert(matchExportCreditPatterns('cara mengekspor ke excel') === null, 'A5c: cara mengekspor … ditolak pola EXPORT');
  assert(matchExportCreditPatterns('gimana ekspor ke excel?') === null, 'A5d: gimana ekspor … ditolak pola EXPORT');
  assert(matchExportCreditPatterns('apakah bisa ekspor ke pdf?') === null, 'A5e: apakah bisa ekspor … ditolak pola EXPORT');
}
// …dan bentuk pertanyaan Excel TETAP dijawab HOWTO oleh router nyata
// (perilaku lama yang wajib bertahan sesudah wiring).
{
  assert(routeIntent('bagaimana cara ekspor ke Excel?').intent === 'HOWTO_EXCEL_EXPORT', 'A6a: router nyata: bagaimana cara ekspor ke Excel → HOWTO');
  assert(routeIntent('cara mengekspor ke excel').intent === 'HOWTO_EXCEL_EXPORT', 'A6b: router nyata: cara mengekspor ke excel → HOWTO');
  // HOWTO saat ini hanya mencakup Excel: pertanyaan PDF jatuh ke LLM
  // (UNKNOWN). Bila koordinator kelak memperluas HOWTO ke PDF, asersi
  // ini yang berubah — bukan pola EXPORT.
  assert(routeIntent('cara ekspor ke pdf gimana?').intent === 'UNKNOWN', 'A6c: router nyata: cara ekspor ke pdf → UNKNOWN (HOWTO belum mencakup PDF)');
}

/* --- B. Pola CREATE_REVISION + non-hijack --- */

{
  const r = matchExportCreditPatterns('buat revisi baru');
  assert(r?.intent === 'CREATE_REVISION' && r.param === 'baru', 'B1: buat revisi baru → CREATE_REVISION + param baru (dibersihkan handler)');
}
{
  const r = matchExportCreditPatterns('buat revisi harga semen');
  assert(r?.intent === 'CREATE_REVISION' && r.param === 'harga semen', 'B2: buat revisi harga semen → param harga semen');
}
{
  const r = matchExportCreditPatterns('buatkan revisi Mutu Beton K-300');
  assert(r?.intent === 'CREATE_REVISION' && r.param === 'Mutu Beton K-300', 'B3: kapitalisasi label terjaga (param dari teks asli)');
}
{
  const r = matchExportCreditPatterns('buat revisi');
  assert(r?.intent === 'CREATE_REVISION' && r.param === undefined, 'B4: buat revisi telanjang → CREATE_REVISION tanpa param');
}
{
  const r = matchExportCreditPatterns('tolong buat revisi baru');
  assert(r?.intent === 'CREATE_REVISION', 'B5: tolong buat revisi baru → CREATE_REVISION (mendahului HELP)');
}
{
  const r = matchExportCreditPatterns('tambah revisi harga semen');
  assert(r?.intent === 'CREATE_REVISION' && r.param === 'harga semen', 'B6: tambah revisi … → CREATE_REVISION');
}
{
  assert(matchExportCreditPatterns('batalkan revisi') === null, 'B7: batalkan revisi → bukan CREATE_REVISION');
  assert(matchExportCreditPatterns('buatkan rab revisi') === null, 'B8: buatkan rab revisi → bukan CREATE_REVISION (itu permintaan RAB)');
  assert(matchExportCreditPatterns('lihat revisi') === null, 'B9: lihat revisi → bukan CREATE_REVISION');
  assert(matchExportCreditPatterns('hapus revisi') === null, 'B10: hapus revisi → bukan CREATE_REVISION');
}

/* --- C. Pola CREDIT_BALANCE + TOPUP_CREDIT + non-hijack --- */

{
  assert(matchExportCreditPatterns('sisa kredit saya')?.intent === 'CREDIT_BALANCE', 'C1: sisa kredit saya → CREDIT_BALANCE');
  assert(matchExportCreditPatterns('berapa kredit saya')?.intent === 'CREDIT_BALANCE', 'C2: berapa kredit saya → CREDIT_BALANCE');
  assert(matchExportCreditPatterns('berapa sisa kredit saya?')?.intent === 'CREDIT_BALANCE', 'C3: berapa sisa kredit saya? → CREDIT_BALANCE');
  assert(matchExportCreditPatterns('kredit saya berapa')?.intent === 'CREDIT_BALANCE', 'C4: kredit saya berapa → CREDIT_BALANCE');
  assert(matchExportCreditPatterns('cek kredit')?.intent === 'CREDIT_BALANCE', 'C5: cek kredit → CREDIT_BALANCE');
  assert(matchExportCreditPatterns('kredit tinggal berapa')?.intent === 'CREDIT_BALANCE', 'C6: kredit tinggal berapa → CREDIT_BALANCE');
}
{
  // Pertanyaan PEMAKAIAN bukan pertanyaan saldo — jangan dijawab saldo.
  assert(matchExportCreditPatterns('berapa kredit yang dipakai') === null, 'C7: berapa kredit yang dipakai → bukan CREDIT_BALANCE');
  assert(matchExportCreditPatterns('berapa kredit yang sudah terpakai') === null, 'C8: … sudah terpakai → bukan CREDIT_BALANCE');
}
{
  const r = matchExportCreditPatterns('top up 500 kredit');
  assert(r?.intent === 'TOPUP_CREDIT' && r.param === '500', 'C9: top up 500 kredit → TOPUP_CREDIT + param 500');
}
{
  const r = matchExportCreditPatterns('tambah kredit 1500');
  assert(r?.intent === 'TOPUP_CREDIT' && r.param === '1500', 'C10: tambah kredit 1500 → TOPUP_CREDIT (mendahului ADD_ITEM)');
}
{
  const r = matchExportCreditPatterns('topup 1.500');
  assert(r?.intent === 'TOPUP_CREDIT' && r.param === '1.500', 'C11: topup 1.500 → param 1.500');
}
{
  const r = matchExportCreditPatterns('top up 1,5 ribu kredit');
  assert(r?.intent === 'TOPUP_CREDIT' && r.param === '1,5 ribu', 'C12: top up 1,5 ribu kredit → param 1,5 ribu');
}
{
  const r = matchExportCreditPatterns('tambah 4000 kredit');
  assert(r?.intent === 'TOPUP_CREDIT' && r.param === '4000', 'C13: tambah 4000 kredit (angka sebelum kata kredit) → TOPUP_CREDIT');
}
{
  const r = matchExportCreditPatterns('top up');
  assert(r?.intent === 'TOPUP_CREDIT' && r.param === undefined, 'C14: top up telanjang → TOPUP_CREDIT tanpa param (daftar tier di handler)');
}
{
  const r = matchExportCreditPatterns('tolong top up 500 kredit');
  assert(r?.intent === 'TOPUP_CREDIT', 'C15: tolong top up 500 kredit → TOPUP_CREDIT (mendahului HELP)');
}
{
  assert(matchExportCreditPatterns('tambah item plesteran 10 m2') === null, 'C16: tambah item … bukan urusan kelompok ini (tetap ADD_ITEM)');
  assert(matchExportCreditPatterns('tambah proyek baru') === null, 'C17: tambah proyek baru bukan TOPUP');
  assert(matchExportCreditPatterns('ubah volume plesteran jadi 25 m2') === null, 'C18: mutasi item bukan urusan kelompok ini');
  assert(matchExportCreditPatterns('berapa total proyek saya?') === null, 'C19: total proyek bukan CREDIT_BALANCE');
  assert(matchExportCreditPatterns('kredit') === null, 'C20: kata kredit telanjang → bukan perintah');
}

/* --- D. Parser/helper --- */

{
  assert(parseExportFormat('Excel').format === 'excel' && !parseExportFormat('Excel').defaulted, 'D1: Excel → excel, bukan default');
  assert(parseExportFormat('xlsx').format === 'excel' && !parseExportFormat('xlsx').defaulted, 'D2: xlsx → excel');
  assert(parseExportFormat('PDF').format === 'pdf' && !parseExportFormat('PDF').defaulted, 'D3: PDF → pdf');
  const d = parseExportFormat(undefined);
  assert(d.format === 'excel' && d.defaulted, 'D4: tanpa format → excel default');
  assert(parseExportFormat('docx').defaulted, 'D5: format tak dikenal → excel default');
}
{
  assert(cleanRevisionLabel('baru') === undefined, 'D6: label "baru" → undefined (konvensi UI)');
  assert(cleanRevisionLabel('harga semen') === 'harga semen', 'D7: label biasa utuh');
  assert(cleanRevisionLabel('harga semen dong') === 'harga semen', 'D8: akhiran dong dibuang');
  assert(cleanRevisionLabel('untuk harga semen') === 'harga semen', 'D9: awalan untuk dibuang');
  assert(cleanRevisionLabel('baru untuk harga semen') === 'harga semen', 'D10: awalan ganda dibuang');
  assert(cleanRevisionLabel('rab ini') === undefined, 'D11: "rab ini" → undefined');
  assert(cleanRevisionLabel(undefined) === undefined, 'D12: undefined → undefined');
  assert(cleanRevisionLabel('  Revisi Mutu Beton K-300  ') === 'Revisi Mutu Beton K-300', 'D13: spasi luar dipangkas, isi utuh');
}
{
  assert(parseCreditAmount('500') === 500, 'D14: 500 → 500');
  assert(parseCreditAmount('1.500') === 1500, 'D15: 1.500 → 1500 (titik pemisah ribuan)');
  assert(parseCreditAmount('1,5 ribu') === 1500, 'D16: 1,5 ribu → 1500');
  assert(parseCreditAmount('2 ribu') === 2000, 'D17: 2 ribu → 2000');
  assert(parseCreditAmount('10.000') === 10000, 'D18: 10.000 → 10000');
  assert(parseCreditAmount('500 kredit') === 500, 'D19: angka di tengah teks ikut terbaca');
  assert(parseCreditAmount('abc') === null, 'D20: abc → null');
  assert(parseCreditAmount('') === null, 'D21: kosong → null');
  assert(parseCreditAmount('-500') === null, 'D22: negatif → null (bukan nilai absolut)');
}
{
  const t500 = resolveTopUpTier(500);
  assert(t500?.itemId === 'topup-500' && t500.priceIdr === 5000, 'D23: 500 → topup-500 Rp5.000');
  assert(resolveTopUpTier(1500)?.itemId === 'topup-1500', 'D24: 1500 → topup-1500');
  assert(resolveTopUpTier(4000)?.itemId === 'topup-4000', 'D25: 4000 → topup-4000');
  assert(resolveTopUpTier(10000)?.itemId === 'topup-10000', 'D26: 10000 → topup-10000');
  assert(resolveTopUpTier(750) === null, 'D27: 750 → null (tidak menebak tier)');
  assert(resolveTopUpTier(2000) === null, 'D28: 2000 → null');
}
{
  const list = formatTopUpTiers();
  assert(list.includes('500 kredit — Rp5.000'), 'D29: daftar tier memuat 500/Rp5.000');
  assert(list.includes('1.500 kredit — Rp10.000'), 'D30: daftar tier memuat 1.500/Rp10.000');
  assert(list.includes('4.000 kredit — Rp25.000'), 'D31: daftar tier memuat 4.000/Rp25.000');
  assert(list.includes('10.000 kredit — Rp50.000'), 'D32: daftar tier memuat 10.000/Rp50.000');
}
{
  const btns = topUpTierButtons();
  assert(btns.length === 4, 'D33: empat tombol tier');
  assert(btns[0].label === 'Top up 500 kredit — Rp5.000', 'D34: label tombol tier 500');
  const a0 = btns[0].action as { kind: string; intent: string; param?: string };
  assert(a0.kind === 'intent' && a0.intent === 'TOPUP_CREDIT' && a0.param === '500', 'D35: aksi tombol tier 500');
  // Round-trip fallback submit(label): label tombol adalah teks perintah
  // yang valid — dikirim sebagai pesan, router mengenalinya kembali.
  for (const b of btns) {
    const m = matchExportCreditPatterns(b.label);
    const amt = parseCreditAmount(m?.param);
    assert(m?.intent === 'TOPUP_CREDIT' && amt !== null && resolveTopUpTier(amt) !== null, `D36: label tombol "${b.label}" kembali dikenali sebagai TOPUP tier`);
  }
}

/* --- Stub ctx --- */

function makeCtx(over: Partial<ExportCreditCommandContext> = {}): {
  ctx: ExportCreditCommandContext;
  calls: { export: ExportFormat[]; revision: Array<string | undefined>; topup: string[] };
} {
  const calls: { export: ExportFormat[]; revision: Array<string | undefined>; topup: string[] } = {
    export: [], revision: [], topup: [],
  };
  const ctx: ExportCreditCommandContext = {
    activeProject: { id: 'p1', name: 'Rumah Tinggal 2 Lantai' },
    exportProject: (format) => { calls.export.push(format); },
    createRevision: (label) => {
      calls.revision.push(label);
      return { versionNumber: 'v1.1', label: label ?? 'v1.1' };
    },
    creditBalance: 1250,
    creditSource: 'simulation',
    topUpCredits: (itemId) => {
      calls.topup.push(itemId);
      const tier = TOPUP_OFFERS.find((t) => t.itemId === itemId);
      if (!tier) return { ok: false, addedCredits: 0, newBalance: null };
      return { ok: true, addedCredits: tier.credits, newBalance: 1250 + tier.credits };
    },
    ...over,
  };
  return { ctx, calls };
}

/* --- E. Handler: EXPORT_PROJECT --- */

{
  const { ctx, calls } = makeCtx();
  const res = handleExportCreditCommand('EXPORT_PROJECT', 'Excel', ctx);
  assert(res?.ok === true, 'E1: ekspor excel → ok');
  assert(calls.export.length === 1 && calls.export[0] === 'excel', 'E1: callback dipanggil dengan excel');
  assert(res?.message.includes('File Excel') && res?.message.includes('Rumah Tinggal 2 Lantai'), 'E1: pesan menyebut file Excel + nama proyek');
  assert(res?.message.includes('sedang disiapkan') && res?.message.includes('unduhan dimulai otomatis'), 'E1: pesan jujur async (sedang disiapkan)');
  assert(!res?.message.includes('berhasil') && !res?.message.includes('selesai'), 'E1: TIDAK ada klaim ekspor selesai');
}
{
  const { ctx, calls } = makeCtx();
  const res = handleExportCreditCommand('EXPORT_PROJECT', 'PDF', ctx);
  assert(calls.export[0] === 'pdf' && res?.message.includes('File PDF'), 'E2: ekspor PDF → callback pdf + pesan File PDF');
  assert(!res?.message.includes('berhasil'), 'E2: PDF juga tanpa klaim selesai');
}
{
  const { ctx, calls } = makeCtx();
  const res = handleExportCreditCommand('EXPORT_PROJECT', undefined, ctx);
  assert(calls.export[0] === 'excel', 'E3: tanpa format → default excel');
  assert(res?.message.includes('(format default)'), 'E3: balasan menyebut format default');
}
{
  const { ctx, calls } = makeCtx();
  handleExportCreditCommand('EXPORT_PROJECT', 'xlsx', ctx);
  assert(calls.export[0] === 'excel', 'E4: xlsx → excel');
}
{
  const { ctx, calls } = makeCtx({ activeProject: null });
  const res = handleExportCreditCommand('EXPORT_PROJECT', 'Excel', ctx);
  assert(calls.export.length === 0, 'E5: tanpa proyek aktif → callback tidak dipanggil');
  assert(res?.message.includes('Tidak ada proyek aktif'), 'E5: pesan jujur tanpa proyek aktif');
  assert(!res?.message.includes('sedang disiapkan'), 'E5: tidak ada klaim ekspor dimulai');
}
{
  const { ctx, calls } = makeCtx();
  delete (ctx as Partial<ExportCreditCommandContext>).exportProject;
  const res = handleExportCreditCommand('EXPORT_PROJECT', 'Excel', ctx);
  assert(calls.export.length === 0 && res?.ok === false, 'E6: tanpa callback → ok false');
  assert(res?.message.includes('belum bisa'), 'E6: pesan jujur belum bisa dari chat');
}
{
  const { ctx } = makeCtx({
    exportProject: () => { throw new Error('boom'); },
  });
  const res = handleExportCreditCommand('EXPORT_PROJECT', 'Excel', ctx);
  assert(res?.ok === false && res?.message.includes('gagal dimulai'), 'E7: callback melempar → ok false, pesan gagal dimulai');
}

/* --- F. Handler: CREATE_REVISION --- */

{
  const { ctx, calls } = makeCtx();
  const res = handleExportCreditCommand('CREATE_REVISION', 'harga semen', ctx);
  assert(res?.ok === true, 'F1: revisi berlabel → ok');
  assert(calls.revision.length === 1 && calls.revision[0] === 'harga semen', 'F1: callback dipanggil dengan label harga semen');
  assert(res?.message.includes('v1.1') && res?.message.includes('"harga semen"'), 'F1: pesan menyebut nomor versi + label');
  assert(res?.message.includes('snapshot item saat ini') && res?.message.includes('revisi lama tidak berubah'), 'F1: pesan menegaskan snapshot + revisi lama tak berubah');
}
{
  const { ctx, calls } = makeCtx();
  const res = handleExportCreditCommand('CREATE_REVISION', 'baru', ctx);
  assert(calls.revision[0] === undefined, 'F2: param "baru" dibersihkan → callback terima undefined (konvensi UI)');
  assert(res?.message.includes('v1.1'), 'F2: pesan menyebut nomor versi dari callback');
}
{
  const { ctx, calls } = makeCtx();
  handleExportCreditCommand('CREATE_REVISION', undefined, ctx);
  assert(calls.revision[0] === undefined, 'F3: tanpa param → callback terima undefined');
}
{
  const { ctx, calls } = makeCtx({ activeProject: null });
  const res = handleExportCreditCommand('CREATE_REVISION', 'harga semen', ctx);
  assert(calls.revision.length === 0 && res?.message.includes('Tidak ada proyek aktif'), 'F4: tanpa proyek aktif → tidak dipanggil, pesan jujur');
}
{
  const { ctx } = makeCtx();
  delete (ctx as Partial<ExportCreditCommandContext>).createRevision;
  const res = handleExportCreditCommand('CREATE_REVISION', 'harga semen', ctx);
  assert(res?.ok === false && res?.message.includes('belum bisa'), 'F5: tanpa callback → ok false, pesan belum bisa');
}
{
  const { ctx } = makeCtx({ createRevision: () => null });
  const res = handleExportCreditCommand('CREATE_REVISION', 'harga semen', ctx);
  assert(res?.ok === false && res?.message.includes('belum dibuat'), 'F6: callback null → ok false, pesan belum dibuat');
  assert(!res?.message.includes('snapshot item saat ini'), 'F6: tidak ada klaim snapshot dibuat');
}
{
  const { ctx, calls } = makeCtx();
  const res = handleExportCreditCommand('CREATE_REVISION', 'A'.repeat(121), ctx);
  assert(calls.revision.length === 0, 'F7: label > 120 karakter → callback tidak dipanggil');
  assert(res?.ok === false && res?.message.includes('120 karakter'), 'F7: pesan menyebut batas 120 karakter');
}

/* --- G. Handler: CREDIT_BALANCE --- */

{
  const { ctx } = makeCtx();
  const res = handleExportCreditCommand('CREDIT_BALANCE', undefined, ctx);
  assert(res?.ok === true && res?.message.includes('1.250 kredit'), 'G1: saldo simulasi 1250 → tampil 1.250 kredit');
  assert(res?.message.includes('simulasi'), 'G1: jawaban menyebut simulasi');
}
{
  const { ctx } = makeCtx({ creditBalance: null });
  const res = handleExportCreditCommand('CREDIT_BALANCE', undefined, ctx);
  assert(res?.ok === false && res?.message.includes('belum bisa'), 'G2: saldo null → ok false, pesan jujur');
  assert(!res?.message.includes('1.250'), 'G2: tidak ada angka karangan');
}
{
  const { ctx } = makeCtx({ creditSource: 'server' });
  const res = handleExportCreditCommand('CREDIT_BALANCE', undefined, ctx);
  assert(res?.message.includes('data server'), 'G3: source server → label data server');
  assert(!res?.message.includes('simulasi'), 'G3: sumber real tidak dilabeli simulasi');
}
{
  const { ctx } = makeCtx({ creditSource: 'live' });
  const res = handleExportCreditCommand('CREDIT_BALANCE', undefined, ctx);
  assert(res?.message.includes('data server'), 'G4: source live (alias) → label data server');
}
{
  const { ctx } = makeCtx({ creditSource: 'unavailable', creditBalance: 0 });
  const res = handleExportCreditCommand('CREDIT_BALANCE', undefined, ctx);
  assert(res?.ok === false && res?.message.includes('belum terhubung'), 'G5: source unavailable → pesan belum terhubung');
  assert(!res?.message.includes('0 kredit'), 'G5: angka 0 unavailableBalance TIDAK ditampilkan sebagai saldo');
}
{
  const { ctx } = makeCtx({ creditSource: undefined });
  const res = handleExportCreditCommand('CREDIT_BALANCE', undefined, ctx);
  assert(res?.message.includes('sumber tidak terkonfirmasi'), 'G6: source tak dikenal → label simulasi (sumber tidak terkonfirmasi)');
}

/* --- H. Handler: TOPUP_CREDIT --- */

{
  const { ctx, calls } = makeCtx();
  const res = handleExportCreditCommand('TOPUP_CREDIT', '500', ctx);
  assert(calls.topup[0] === 'topup-500', 'H1: 500 → itemId topup-500');
  assert(res?.ok === true && res?.message.includes('+500 kredit'), 'H1: pesan +500 kredit');
  assert(res?.message.includes('Rp5.000') && res?.message.includes('Saldo baru: 1.750 kredit'), 'H1: pesan harga + saldo baru 1.750');
  assert(res?.message.includes('SIMULASI'), 'H1: balasan top-up berlabel SIMULASI');
}
{
  const { ctx, calls } = makeCtx();
  const res = handleExportCreditCommand('TOPUP_CREDIT', '1500', ctx);
  assert(calls.topup[0] === 'topup-1500' && res?.message.includes('+1.500 kredit'), 'H2: 1500 → topup-1500, +1.500 kredit');
  assert(res?.message.includes('Rp10.000') && res?.message.includes('Saldo baru: 2.750 kredit'), 'H2: Rp10.000 + saldo baru 2.750');
}
{
  const { ctx, calls } = makeCtx();
  const res = handleExportCreditCommand('TOPUP_CREDIT', '4000', ctx);
  assert(calls.topup[0] === 'topup-4000' && res?.message.includes('Saldo baru: 5.250 kredit'), 'H3: 4000 → topup-4000, saldo baru 5.250');
}
{
  const { ctx, calls } = makeCtx();
  const res = handleExportCreditCommand('TOPUP_CREDIT', '10.000', ctx);
  assert(calls.topup[0] === 'topup-10000' && res?.message.includes('Saldo baru: 11.250 kredit'), 'H4: 10.000 → topup-10000, saldo baru 11.250');
}
{
  const { ctx, calls } = makeCtx();
  const res = handleExportCreditCommand('TOPUP_CREDIT', '750', ctx);
  assert(calls.topup.length === 0, 'H5: 750 (bukan tier) → callback tidak dipanggil');
  assert(res?.message.includes('tidak cocok'), 'H5: pesan menyebut jumlah tidak cocok');
  assert(res?.message.includes('500 kredit') && res?.message.includes('1.500 kredit') && res?.message.includes('4.000 kredit') && res?.message.includes('10.000 kredit'), 'H5: keempat tier ditampilkan');
  assert(res?.actions?.length === 4, 'H5: empat tombol tier dilampirkan');
  assert(/simulasi/i.test(res?.message ?? ''), 'H5: balasan jumlah tak dikenal berlabel simulasi');
}
{
  const { ctx, calls } = makeCtx();
  const res = handleExportCreditCommand('TOPUP_CREDIT', undefined, ctx);
  assert(calls.topup.length === 0, 'H6: tanpa jumlah → callback tidak dipanggil');
  assert(res?.message.includes('Sebutkan jumlahnya') && res?.actions?.length === 4, 'H6: daftar tier + tanya + 4 tombol');
  assert(/simulasi/i.test(res?.message ?? ''), 'H6: balasan tanpa jumlah berlabel simulasi');
}
{
  const { ctx, calls } = makeCtx();
  const res = handleExportCreditCommand('TOPUP_CREDIT', 'abc', ctx);
  assert(calls.topup.length === 0 && res?.message.includes('Sebutkan jumlahnya'), 'H7: jumlah tak terbaca → daftar tier, tanpa callback');
}
{
  const { ctx } = makeCtx();
  delete (ctx as Partial<ExportCreditCommandContext>).topUpCredits;
  const res = handleExportCreditCommand('TOPUP_CREDIT', '500', ctx);
  assert(res?.ok === false && res?.message.includes('belum bisa'), 'H8: tanpa callback → ok false, pesan belum bisa');
  assert(/simulasi/i.test(res?.message ?? ''), 'H8: balasan tanpa callback berlabel simulasi');
}
{
  const { ctx } = makeCtx({
    topUpCredits: () => ({ ok: false, addedCredits: 0, newBalance: null, reason: 'Paket Free tidak bisa top-up' }),
  });
  const res = handleExportCreditCommand('TOPUP_CREDIT', '500', ctx);
  assert(res?.ok === false && res?.message.includes('Paket Free tidak bisa top-up'), 'H9: callback gagal → alasan diteruskan');
  assert(res?.message.includes('tidak berubah'), 'H9: pesan menegaskan saldo tidak berubah');
}
{
  const { ctx } = makeCtx({ topUpCredits: () => null });
  const res = handleExportCreditCommand('TOPUP_CREDIT', '500', ctx);
  assert(res?.ok === false && res?.message.includes('belum berhasil'), 'H10: callback null → ok false, pesan belum berhasil');
}
{
  const { ctx } = makeCtx({
    topUpCredits: () => ({ ok: true, addedCredits: 500, newBalance: null }),
  });
  const res = handleExportCreditCommand('TOPUP_CREDIT', '500', ctx);
  assert(res?.ok === true && !res?.message.includes('Saldo baru'), 'H11: saldo baru null → TIDAK diklaim');
  assert(res?.message.includes('sisa kredit saya'), 'H11: pengguna diarahkan cek saldo');
}

/* --- I. Intent asing → null --- */

{
  const { ctx } = makeCtx();
  assert(handleExportCreditCommand('RENAME_PROJECT', 'Rumah Impian', ctx) === null, 'I1: RENAME_PROJECT → null');
  assert(handleExportCreditCommand('UNKNOWN', undefined, ctx) === null, 'I2: UNKNOWN → null');
  assert(handleExportCreditCommand('EXPORT_PROJECT', 'Excel', ctx) !== null, 'I3: EXPORT_PROJECT → ditangani');
}

console.log(`chatExportCreditCommands: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

/**
 * EZRAB Chat AI — Perintah deterministik EKSPOR, REVISI, KREDIT
 * (Kelompok 4, 2026-11-17, matriks F #33–#34, I #39, J #40, K #41–#42
 * + gap P5 + P8 audit perintah Ezrab AI).
 *
 * Modul mandiri (belum ter-wiring): koordinator menyambungkannya ke
 * - intentRouter.ts: tempel EXPORT_CREDIT_PATTERNS ke AWAL PATTERNS
 *   (SEBELUM kelompok mutasi item — lihat "Urutan" di bawah), tambahkan
 *   keempat intent ke union ChatIntent. Tidak ada cabang klarifikasi
 *   tanpa-param (semua intent punya default/daftar yang jujur).
 * - actionRegistry.ts: tiap case executeIntent memanggil
 *   handleExportCreditCommand(intent, param, ctx) — ctx registry HARUS
 *   diperluas dengan callback/field ExportCreditCommandContext (lihat
 *   WIRING SPEC di laporan kelompok ini).
 * - view.tsx (EzrabAiView): pasang callback + field kredit di
 *   ChatActionContext jalur submit (view.tsx:2204-2232). Hook kredit
 *   SUDAH ter-mount di view (useCreditSimulation, view.tsx:445) —
 *   tinggal teruskan balance + source + topUp.
 *
 * Pola mengikuti konvensi yang ada: dicocokkan pada teks ternormalisasi
 * huruf kecil, tanpa flag /i; param diekstrak dari teks ASLI via
 * re-match case-insensitive (pola routeIntent). matchExportCreditPatterns
 * meniru semantik loop routeIntent persis (first-match-wins + ekstraksi
 * param dari teks asli) agar pola bisa dites tanpa menyentuh router.
 *
 * Fail-closed seperti RENAME_PROJECT: tanpa proyek aktif / tanpa
 * callback / data kredit tak tersedia / tier tak dikenal → pesan
 * jujur, TIDAK ADA klaim sukses, TIDAK ADA mutasi, TIDAK ADA angka
 * karangan. Ekspor TIDAK PERNAH diklaim selesai (eksekusi async di
 * view); semua jawaban top-up berlabel SIMULASI; jawaban saldo SELALU
 * menyebut sumbernya.
 */
import type { ActionResult, ChatActionButton } from '../actionRegistry';
import { TOPUP_OFFERS, type TopUpTier } from '../../../ai-credits/config';

/** Batas label revisi — sama seperti nama proyek (rename, maks 120). */
export const REVISION_MAX_LABEL_LENGTH = 120;

/** Intent yang dimiliki kelompok ini. */
export const EXPORT_CREDIT_INTENTS: ReadonlySet<string> = new Set([
  'EXPORT_PROJECT',
  'CREATE_REVISION',
  'CREDIT_BALANCE',
  'TOPUP_CREDIT',
]);

export type ExportFormat = 'excel' | 'pdf';

/** Hasil pembuatan revisi yang dikembalikan callback view. */
export interface CreatedRevision {
  /** Nomor versi yang ditetapkan engine, mis. "v1.1". */
  versionNumber: string;
  /** Label revisi yang tersimpan (label perintah atau konvensi UI). */
  label: string;
}

/** Hasil top-up yang dikembalikan callback view. */
export interface TopUpCreditResult {
  /** true bila kredit benar-benar bertambah. */
  ok: boolean;
  /** Kredit yang ditambahkan (0 bila gagal). */
  addedCredits: number;
  /** Saldo total sesudah top-up; null bila view tidak melaporkannya. */
  newBalance: number | null;
  /** Alasan kegagalan yang jujur, mis. paket Free tidak bisa top-up. */
  reason?: string;
}

/**
 * Konteks LOKAL kelompok ini (sengaja tidak mengimpor ChatActionContext
 * — koordinator memetakan field-field ini ke ChatActionContext saat
 * wiring; lihat WIRING SPEC). Semua aksi aplikasi lewat callback/field
 * ini — modul ini TIDAK PERNAH mengimpor exporter, ProjectContext,
 * atau hook kredit.
 */
export interface ExportCreditCommandContext {
  /** Proyek aktif (null bila tidak ada) — wajib untuk ekspor & revisi. */
  activeProject: { id: string; name: string } | null;
  /**
   * Mengekspor proyek aktif (disediakan view — membungkus
   * exportProjectToExcel/exportProjectToPDF + company; eksekusi async
   * di view, di luar handler ini). Tanpa callback ini, EXPORT_PROJECT
   * dijawab jujur "belum bisa".
   */
  exportProject?: (format: ExportFormat) => void;
  /**
   * Membuat revisi baru (disediakan view — membungkus
   * createEstimateVersion; label undefined = pakai konvensi UI,
   * nextVersionNumber). Mengembalikan revisi yang dibuat, null bila
   * proyek tidak ditemukan. Tanpa callback ini, CREATE_REVISION
   * dijawab jujur "belum bisa".
   */
  createRevision?: (label: string | undefined) => CreatedRevision | null;
  /**
   * Saldo kredit total (diisi view dari hook kredit yang sudah
   * ter-mount); null/undefined = data kredit tidak tersedia.
   */
  creditBalance?: number | null;
  /**
   * Sumber saldo dari hook (BalanceSource: 'server' | 'simulation' |
   * 'unavailable'); undefined/tak dikenal = sumber tidak terkonfirmasi.
   * 'server' adalah sumber real (kode tidak mengenal nilai 'live').
   */
  creditSource?: string;
  /**
   * Top-up simulasi per itemId katalog (disediakan view — membungkus
   * topUp hook / mockTopUp). Mengembalikan hasil + saldo baru, null
   * bila tidak dapat diproses. Tanpa callback ini, TOPUP_CREDIT
   * dijawab jujur "belum bisa".
   */
  topUpCredits?: (itemId: string) => TopUpCreditResult | null;
}

export interface ExportCreditPattern {
  intent: string;
  re: RegExp;
  /** extract param via capture group 1 */
  paramGroup?: boolean;
  /** false = intent flows to AI instead of local execution (default true) */
  localOnly?: boolean;
}

/**
 * Pola router untuk teks ternormalisasi (huruf kecil, tanpa flag /i).
 *
 * URUTAN (koordinator yang menempel — lihat wiring spec): SELURUH blok
 * ini ditempel di AWAL PATTERNS, SEBELUM kelompok mutasi item
 * (intentRouter.ts:132). Alasannya (terbukti probe routeIntent
 * 2026-11-17 terhadap router saat ini):
 * - "tolong ekspor ke excel" / "tolong buat revisi baru" / "tolong top
 *   up 500 kredit" saat ini jatuh ke HELP (pola HELP menelan "tolong"
 *   tanpa objek rab/proyek/ahsp) — blok ini harus mendahului HELP.
 * - "tambah kredit 1500" saat ini jatuh ke ADD_ITEM (param "kredit
 *   1500") — pola TOPUP_CREDIT harus mendahului ADD_ITEM.
 * - Penempatan di awal otomatis juga SEBELUM HOWTO_EXCEL_EXPORT
 *   (intentRouter.ts:339-340) — syarat konflik HOWTO vs EXPORT.
 *
 * KONFLIK HOWTO vs EXPORT (kedua arah dijaga):
 * - Bentuk PERINTAH ("ekspor ke Excel", "ekspor RAB ini ke PDF")
 *   ditangkap pola EXPORT_PROJECT di sini.
 * - Bentuk PERTANYAAN ("bagaimana cara ekspor ke Excel?", "cara
 *   ekspor ke pdf gimana?") DITOLAK pola ini lewat penjaga lookahead
 *   ^(?!.*\b(?:bagaimana|gimana|cara|apakah)\b) sehingga jatuh ke
 *   HOWTO_EXCEL_EXPORT (Excel) atau ke LLM (PDF — HOWTO saat ini
 *   hanya mencakup Excel; lihat wiring spec).
 */
export const EXPORT_CREDIT_PATTERNS: ExportCreditPattern[] = [
  // --- TOPUP_CREDIT: jumlah dulu (spesifik), lalu bentuk telanjang.
  // Grup 1 = angka + pengali opsional ("500", "1.500", "1,5 ribu").
  // Ditempatkan sebelum CREDIT_BALANCE agar "cek top up kredit"
  // menjawab daftar paket, bukan saldo.
  { intent: 'TOPUP_CREDIT', re: /\btop\s?-?up\b[^0-9]{0,20}(\d[\d.,]*\s*(?:ribu|rb|juta|jt)?)/, paramGroup: true },
  { intent: 'TOPUP_CREDIT', re: /\b(?:tambah|tambahkan|tambahin|isi|belikan|beli)\b.*\bkredit\b[^0-9]{0,10}(\d[\d.,]*\s*(?:ribu|rb|juta|jt)?)/, paramGroup: true },
  { intent: 'TOPUP_CREDIT', re: /\b(?:tambah|tambahkan|tambahin|isi|belikan|beli)\b[^0-9]{0,10}(\d[\d.,]*\s*(?:ribu|rb|juta|jt)?)\s*kredit\b/, paramGroup: true },
  { intent: 'TOPUP_CREDIT', re: /\btop\s?-?up\b/ },
  { intent: 'TOPUP_CREDIT', re: /\b(?:tambah|tambahkan|tambahin|isi)\b.*\bkredit\b/ },

  // --- CREDIT_BALANCE: pertanyaan SALDO. Pertanyaan PEMAKAIAN
  // ("berapa kredit yang dipakai") dikecualikan lewat penjaga —
  // menjawabnya dengan saldo adalah jawaban yang salah.
  { intent: 'CREDIT_BALANCE', re: /^(?!.*\b(?:dipakai|terpakai|digunakan|konsumsi)\b).*\b(?:sisa|saldo|berapa)\b.*\bkredit\b/ },
  { intent: 'CREDIT_BALANCE', re: /^(?!.*\b(?:dipakai|terpakai|digunakan|konsumsi)\b).*\bkredit\b.*\b(?:sisa|saldo|berapa|tersisa|tinggal)\b/ },
  { intent: 'CREDIT_BALANCE', re: /^(?!.*\b(?:dipakai|terpakai|digunakan|konsumsi)\b).*\b(?:cek|lihat|tampilkan|tampilin|tunjukkan)\b.*\bkredit\b/ },

  // --- EXPORT_PROJECT: format dulu (grup 1 = format), lalu bentuk
  // telanjang (tanpa format → default Excel, ditangani handler).
  // Penjaga tanya melindungi HOWTO (lihat komentar blok di atas).
  { intent: 'EXPORT_PROJECT', re: /^(?!.*\b(?:bagaimana|gimana|cara|apakah)\b).*\b(?:ekspor|export|mengekspor|unduh|download)\b.*\b(excel|xlsx|pdf)\b/, paramGroup: true },
  { intent: 'EXPORT_PROJECT', re: /^(?!.*\b(?:bagaimana|gimana|cara|apakah)\b)\s*(?:tolong\s+)?(?:ekspor|export|mengekspor|unduh|download)\b(?:\s+(?:rab|rencana|anggaran|biaya|proyek|ini|spreadsheet|rincian|file|dokumen|dong|ya|tolong|please|ke|dalam))*\s*[!.?]*$/ },

  // --- CREATE_REVISION: label = ekor sesudah kata "revisi" (grup 1).
  // Pola dijangkar ketat (verba + "revisi" berdampingan) agar
  // "buatkan rab revisi" TIDAK terbajak — itu permintaan RAB, bukan
  // perintah snapshot; "batalkan revisi" / "lihat revisi" juga tidak
  // cocok (tanpa verba buat/tambah).
  { intent: 'CREATE_REVISION', re: /\b(?:buat|buatkan|buatin|bikin|tambah|tambahkan|tambahin)\b(?:\s+(?:sebuah|satu))?\s+revisi\s+(.+)/, paramGroup: true },
  { intent: 'CREATE_REVISION', re: /^\s*(?:tolong\s+)?(?:buat|buatkan|buatin|bikin|tambah|tambahkan|tambahin)\b(?:\s+(?:sebuah|satu))?\s+revisi\s*(?:baru)?\s*[!.?]*$/ },
];

/** Normalisasi teks perintah — identik dengan norm() di intentRouter. */
export function normalizeCommandText(raw: string): string {
  return raw.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Menjalankan EXPORT_CREDIT_PATTERNS atas satu pesan dengan semantik
 * loop routeIntent persis: teks ternormalisasi, first-match-wins,
 * param diekstrak dari teks ASLI via re-match case-insensitive.
 * Dipakai tes (dan bisa dipakai koordinator untuk verifikasi pola);
 * router produksi tetap memakai PATTERNS-nya sendiri sesudah wiring.
 */
export function matchExportCreditPatterns(rawInput: string): { intent: string; param?: string } | null {
  const input = normalizeCommandText(rawInput);
  if (!input) return null;
  for (const p of EXPORT_CREDIT_PATTERNS) {
    const m = input.match(p.re);
    if (!m) continue;
    let param: string | undefined;
    if (p.paramGroup) {
      const rawRe = new RegExp(p.re.source, p.re.flags.includes('i') ? p.re.flags : `${p.re.flags}i`);
      const rawM = rawInput.match(rawRe);
      param = (rawM?.[1] ?? m[1] ?? '').trim() || undefined;
    }
    return { intent: p.intent, param };
  }
  return null;
}

const formatId = (n: number): string => n.toLocaleString('id-ID');

/** Format Rupiah singkat: Rp5.000 (tanpa desimal). */
const formatRp = (n: number): string => `Rp${n.toLocaleString('id-ID')}`;

/**
 * Format ekspor dari param pola (grup 1 = "excel"/"xlsx"/"pdf" dalam
 * kapitalisasi asli). Tanpa format yang dikenali → default Excel
 * (defaulted: true — handler wajib menyebutkannya di balasan).
 */
export function parseExportFormat(param: string | undefined): { format: ExportFormat; defaulted: boolean } {
  const f = (param ?? '').trim().toLowerCase();
  if (f === 'pdf') return { format: 'pdf', defaulted: false };
  if (f === 'excel' || f === 'xlsx') return { format: 'excel', defaulted: false };
  return { format: 'excel', defaulted: true };
}

/** Kata pengisi di awal label revisi ("baru untuk harga semen" → "harga semen"). */
const REVISION_LEADING_FILLERS =
  /^(?:baru|untuk|tentang|mengenai|soal|bernama|dengan\s+nama|yang|rab|proyek|ini)\s+/i;
/** Kata pengisi di akhir label ("harga semen dong" → "harga semen"). */
const REVISION_TRAILING_FILLERS = /\s+(?:dong|ya|tolong|please)\s*$/i;
/** Label yang seluruhnya hanya kata pengisi → bukan label. */
const REVISION_EMPTY_LABELS = /^(?:baru|revisi|revisi baru|yang baru|ini|itu)$/i;

/**
 * Membersihkan label revisi dari param pola. Mengembalikan undefined
 * bila tidak ada label yang bermakna ("buat revisi baru" → undefined —
 * view memakai konvensi UI nextVersionNumber).
 */
export function cleanRevisionLabel(param: string | undefined): string | undefined {
  let label = (param ?? '').trim().replace(/\s+/g, ' ');
  if (!label) return undefined;
  let prev = '';
  while (prev !== label) {
    prev = label;
    label = label.replace(REVISION_LEADING_FILLERS, '').trim();
  }
  label = label.replace(REVISION_TRAILING_FILLERS, '').trim();
  if (!label || REVISION_EMPTY_LABELS.test(label)) return undefined;
  return label;
}

/**
 * Jumlah kredit dari param ("500", "1.500", "1,5 ribu", "2 jt").
 * Titik = pemisah ribuan id-ID, koma = desimal; "ribu"/"rb" ×1.000,
 * "juta"/"jt" ×1.000.000. null bila tidak ada angka yang bisa dibaca
 * atau jumlah tidak positif. Angka negatif ditolak (bukan dibaca
 * nilai absolutnya).
 */
export function parseCreditAmount(param: string | undefined): number | null {
  if (!param) return null;
  if (/-\s*\d/.test(param)) return null;
  const m = /(\d[\d.,]*)\s*(ribu|rb|juta|jt)?/i.exec(param);
  if (!m) return null;
  const raw = m[1].replace(/\./g, '').replace(',', '.');
  let value = Number.parseFloat(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  const suffix = (m[2] ?? '').toLowerCase();
  if (suffix === 'ribu' || suffix === 'rb') value *= 1_000;
  else if (suffix === 'juta' || suffix === 'jt') value *= 1_000_000;
  const rounded = Math.round(value);
  return rounded > 0 ? rounded : null;
}

/**
 * Tier top-up kanonis (TOPUP_OFFERS, config.ts — Spec v1.0 §7.2 K6)
 * berdasarkan JUMLAH kredit. null bila jumlah tidak cocok tier mana
 * pun (tidak pernah menebak tier terdekat).
 */
export function resolveTopUpTier(credits: number): TopUpTier | null {
  return TOPUP_OFFERS.find((t) => t.credits === credits) ?? null;
}

/** Daftar keempat tier sebagai teks bullet (dipakai balasan top-up). */
export function formatTopUpTiers(): string {
  return TOPUP_OFFERS.map(
    (t) => `• ${formatId(t.credits)} kredit — ${formatRp(t.priceIdr)}`,
  ).join('\n');
}

/**
 * Tombol satu-per-tier. Labelnya adalah teks perintah yang valid
 * ("Top up 500 kredit — Rp5.000") karena tombol intent tanpa cabang
 * eksplisit di handleActionButtonInner jatuh ke submit(label)
 * (view.tsx:3703-3706); param membawa jumlahnya bila koordinator
 * menambahkan cabang TOPUP_CREDIT.
 */
export function topUpTierButtons(): ChatActionButton[] {
  return TOPUP_OFFERS.map((t) => ({
    label: `Top up ${formatId(t.credits)} kredit — ${formatRp(t.priceIdr)}`,
    action: { kind: 'intent', intent: 'TOPUP_CREDIT', param: String(t.credits) },
  }));
}

/** Pesan standar tanpa proyek aktif (sama redaksinya dengan rename). */
function noActiveProjectMessage(verb: string): string {
  return `Tidak ada proyek aktif. Buka salah satu proyek dulu di Daftar Proyek, lalu ulangi perintah ${verb}.`;
}

function handleExportProject(param: string | undefined, ctx: ExportCreditCommandContext): ActionResult {
  const { format, defaulted } = parseExportFormat(param);
  if (!ctx.activeProject) {
    return { ok: true, message: noActiveProjectMessage('ekspornya') };
  }
  if (!ctx.exportProject) {
    return {
      ok: false,
      message: 'Saya belum bisa mengekspor dari chat ini. Ekspor lewat menu Laporan (tombol "Export Excel (.xlsx)" / "Export PDF" di kanan atas).',
    };
  }
  try {
    ctx.exportProject(format);
  } catch {
    return {
      ok: false,
      message: `Ekspor ${format === 'pdf' ? 'PDF' : 'Excel'} gagal dimulai — coba lewat menu Laporan.`,
    };
  }
  // JANGAN PERNAH mengklaim ekspor selesai: eksekusi async di view
  // (unduhan dipicu exporter di browser). Balasan hanya menyatakan
  // perintah diterima + unduhan akan dimulai otomatis.
  const fileWord = format === 'pdf' ? 'PDF' : 'Excel';
  const prefix = defaulted ? 'Mengekspor ke Excel (format default)… ' : '';
  return {
    ok: true,
    message: `${prefix}File ${fileWord} proyek "${ctx.activeProject.name}" sedang disiapkan — unduhan dimulai otomatis.`,
  };
}

function handleCreateRevision(param: string | undefined, ctx: ExportCreditCommandContext): ActionResult {
  const label = cleanRevisionLabel(param);
  if (label !== undefined && label.length > REVISION_MAX_LABEL_LENGTH) {
    return {
      ok: false,
      message: `Label revisi maksimal ${REVISION_MAX_LABEL_LENGTH} karakter — yang diminta ${label.length} karakter. Coba label yang lebih pendek.`,
    };
  }
  if (!ctx.activeProject) {
    return { ok: true, message: noActiveProjectMessage('revisinya') };
  }
  if (!ctx.createRevision) {
    return {
      ok: false,
      message: 'Saya belum bisa membuat revisi dari chat ini. Buat revisi lewat menu RAB & Estimasi (panel Versi & Skenario).',
    };
  }
  let created: CreatedRevision | null;
  try {
    created = ctx.createRevision(label);
  } catch {
    return {
      ok: false,
      message: 'Revisi belum dibuat — terjadi kesalahan saat menyimpan snapshot. Coba lagi atau buat lewat panel Versi & Skenario.',
    };
  }
  if (!created) {
    return {
      ok: false,
      message: `Revisi belum dibuat — proyek "${ctx.activeProject.name}" tidak ditemukan di daftar aktif. Coba pilih ulang proyeknya di Daftar Proyek, lalu ulangi perintahnya.`,
    };
  }
  return {
    ok: true,
    message: `Revisi baru ${created.versionNumber} ("${created.label}") dibuat sebagai snapshot item saat ini — revisi lama tidak berubah.`,
  };
}

function handleCreditBalance(ctx: ExportCreditCommandContext): ActionResult {
  // 'unavailable' = akun nyata ADA tapi server tidak menjawab — UI
  // WAJIB menampilkan "belum terhubung" dan TIDAK menampilkan angka
  // (unavailableBalance() bertotal 0 — menampilkannya sebagai saldo
  // adalah klaim palsu). Lihat types.ts BalanceSource.
  if (ctx.creditSource === 'unavailable') {
    return {
      ok: false,
      message: 'Saldo kredit belum terhubung — server kredit tidak menjawab saat ini. Coba lagi nanti; saya tidak menampilkan angka simulasi sebagai pengganti.',
    };
  }
  const balance = ctx.creditBalance;
  if (balance === null || balance === undefined || !Number.isFinite(balance)) {
    return {
      ok: false,
      message: 'Saya belum bisa melihat saldo kredit saat ini — data kredit tidak tersedia. Buka menu Kredit AI untuk memeriksa.',
    };
  }
  const n = formatId(balance);
  // 'server' adalah sumber real di kode ini (tidak ada nilai 'live');
  // 'live' diterima sebagai alias defensif dengan label yang sama.
  if (ctx.creditSource === 'server' || ctx.creditSource === 'live') {
    return { ok: true, message: `Saldo kredit Anda: ${n} kredit (saldo akun — data server).` };
  }
  if (ctx.creditSource === 'simulation') {
    return { ok: true, message: `Saldo kredit Anda: ${n} kredit (simulasi — bukan saldo nyata).` };
  }
  return { ok: true, message: `Saldo kredit Anda: ${n} kredit (simulasi, sumber tidak terkonfirmasi).` };
}

function handleTopUpCredit(param: string | undefined, ctx: ExportCreditCommandContext): ActionResult {
  const amount = parseCreditAmount(param);
  // Tanpa jumlah yang terbaca → daftar tier + tanya (bukan menebak).
  if (amount === null) {
    return {
      ok: true,
      message:
        'Top-up kredit tersedia dalam 4 paket — semuanya simulasi, bukan pembayaran nyata:\n' +
        `${formatTopUpTiers()}\n\nSebutkan jumlahnya, contoh: "top up 1500 kredit".`,
      actions: topUpTierButtons(),
    };
  }
  const tier = resolveTopUpTier(amount);
  // Jumlah tidak cocok tier mana pun → tampilkan keempat tier + tanya.
  if (!tier) {
    return {
      ok: true,
      message:
        `Jumlah ${formatId(amount)} kredit tidak cocok dengan paket top-up yang tersedia. Paket yang tersedia — semuanya simulasi, bukan pembayaran nyata:\n` +
        `${formatTopUpTiers()}\n\nSebutkan salah satu jumlah di atas, contoh: "top up 1500 kredit".`,
      actions: topUpTierButtons(),
    };
  }
  if (!ctx.topUpCredits) {
    return {
      ok: false,
      message: 'Saya belum bisa memproses top-up dari chat ini. Top-up tersedia lewat tombol "Top-up (simulasi)" di layar chat ini atau menu Kredit AI. (Simulasi — bukan pembayaran nyata.)',
    };
  }
  let result: TopUpCreditResult | null;
  try {
    result = ctx.topUpCredits(tier.itemId);
  } catch {
    result = null;
  }
  if (!result || !result.ok) {
    const reason = result?.reason ? `: ${result.reason}` : '';
    return {
      ok: false,
      message: `Top-up simulasi belum berhasil${reason}. Saldo tidak berubah. (Simulasi — bukan pembayaran nyata.)`,
    };
  }
  const balanceLine =
    result.newBalance !== null && Number.isFinite(result.newBalance)
      ? ` Saldo baru: ${formatId(result.newBalance)} kredit.`
      : ' Ketik "sisa kredit saya" untuk melihat saldo terbaru.';
  return {
    ok: true,
    message: `Top-up simulasi berhasil: +${formatId(tier.credits)} kredit (${formatRp(tier.priceIdr)}).${balanceLine} [SIMULASI — bukan pembayaran nyata.]`,
  };
}

/**
 * Handler kelompok ini. Mengembalikan null bila intent bukan milik
 * kelompok ini (koordinator mendelegasikan keempat case
 * executeIntent ke sini dan memakai null sebagai "bukan urusan saya").
 */
export function handleExportCreditCommand(
  intent: string,
  param: string | undefined,
  ctx: ExportCreditCommandContext,
): ActionResult | null {
  switch (intent) {
    case 'EXPORT_PROJECT':
      return handleExportProject(param, ctx);
    case 'CREATE_REVISION':
      return handleCreateRevision(param, ctx);
    case 'CREDIT_BALANCE':
      return handleCreditBalance(ctx);
    case 'TOPUP_CREDIT':
      return handleTopUpCredit(param, ctx);
    default:
      return null;
  }
}

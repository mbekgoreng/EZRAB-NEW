/**
 * EZRAB Chat AI — Perintah deterministik QTO (2026-11-17, matriks E
 * #28–#31 audit perintah Ezrab AI + gap P7).
 *
 * Dua intent, keduanya dieksekusi langsung lewat callback view (pola
 * RENAME_PROJECT) — tanpa LLM, tanpa kredit:
 *   CREATE_QTO_ITEM — "buat item QTO galian tanah 10 m3"
 *                     → createManualQtoItem (ProjectContext.tsx:1886)
 *   SYNC_QTO        — "sinkronkan QTO galian ke RAB" / "sinkronkan
 *                     semua QTO" → syncQtoToRabSpreadsheet per item
 *                     (ProjectContext.tsx:1743)
 *
 * Modul ini TIDAK me-wiring dirinya sendiri: koordinator menyalin
 * QTO_PATTERNS ke PATTERNS intentRouter.ts, menambahkan case
 * executeIntent di actionRegistry.ts yang mendelegasikan ke
 * handleQtoCommand, dan menyediakan callback di view.tsx (lihat
 * WIRING SPEC di laporan pengiriman — modul ini hanya mendefinisikan
 * kontraknya). Handler TIDAK mengimpor ProjectContext — semua aksi
 * aplikasi lewat callback ctx.
 *
 * Aturan kejujuran (cermin rename + mutasi item RAB):
 * - SATUAN WAJIB pada CREATE_QTO_ITEM: bila tidak disebut, handler
 *   bertanya — JANGAN default diam-diam ke m³ meski
 *   createManualQtoItem default begitu (data.unit || 'm³').
 * - Item QTO TANPA HARGA tidak pernah disinkron diam-diam dari chat:
 *   alur konfirmasi UI-nya ada di QtoRekapVolumeView.tsx
 *   (pendingUnpricedSync, :324-374) dan chat tidak bisa menampilkan
 *   dialog itu — handler menjawab jujur + mengarahkan ke Rekap QTO.
 *   "Tanpa harga" dikenali persis seperti UI: decideQtoSyncPrice
 *   (qtoSyncPricing.ts) — lihat qtoHasTransferablePrice.
 * - "Sinkronkan semua QTO" menyinkronkan HANYA item berharga; item
 *   tanpa harga dilaporkan DENGAN NAMANYA sebagai dilewati — tidak
 *   pernah dibuang diam-diam.
 * - Tanpa proyek aktif / tanpa callback → fail-closed jujur.
 */
import type { ActionResult, ChatActionButton } from '../actionRegistry';
import { parseRequestedQuantity } from '../chatAnswerTransfer';

export const QTO_CREATE_INTENT = 'CREATE_QTO_ITEM';
export const QTO_SYNC_INTENT = 'SYNC_QTO';

/** Bentuk pola yang sama dengan `Pattern` di intentRouter.ts. */
export interface QtoPattern {
  intent: string;
  re: RegExp;
  paramGroup?: boolean;
  localOnly?: boolean;
}

/**
 * Pola intent QTO — regex untuk teks TERNORMALISASI (huruf kecil,
 * tanpa flag /i, seperti pola yang ada). URUTAN DI DALAM DAFTAR INI
 * BERARTI (routeIntent memakai pola pertama yang cocok):
 *   1. CREATE ber-param sebelum CREATE telanjang (klarifikasi).
 *   2. SYNC "semua" sebelum SYNC bernama — bila tidak, "sinkronkan
 *      semua QTO ke RAB" tertangkap pola bernama dengan param
 *      "ke rab" (nama kosong) dan salah diminta klarifikasi.
 *   3. SYNC bernama ber-"qto" sebelum SYNC bernama tanpa "qto".
 * Penempatan di PATTERNS intentRouter: PALING ATAS, sebelum blok
 * mutasi item RAB (sebelum UPDATE_ITEM_VOLUME) — "tambah item QTO …"
 * akan ditelan pola ADD_ITEM bila QTO diletakkan sesudahnya, dan
 * "tolong buatkan item QTO …" akan ditelan pola HELP.
 */
export const QTO_PATTERNS: QtoPattern[] = [
  // CREATE_QTO_ITEM ber-param: "buat item qto galian tanah 10 m3",
  // "buatkan qto urugan pasir 5 m3", "tambah qto pondasi 2 m3",
  // "buat qto baru galian tanah 10 m3" (kata "baru" opsional).
  // Param = ekor sesudah kata "qto" (uraian + volume + satuan);
  // handler yang mem-parsingnya via parseCreateQtoTarget.
  {
    intent: 'CREATE_QTO_ITEM',
    re: /\b(?:buat|buatkan|buatin|bikin|tambah|tambahkan|tambahin)\b.*\bqto\b\s+(?:baru\s+)?(.+)/,
    paramGroup: true,
  },
  // CREATE_QTO_ITEM telanjang → klarifikasi ("buat item qto",
  // "tambah qto baru"). Dijangkar agar "cara buat item qto" tidak
  // tertangkap.
  {
    intent: 'CREATE_QTO_ITEM',
    re: /^\s*(?:tolong\s+)?(?:buat|buatkan|buatin|bikin|tambah|tambahkan|tambahin)\b.*\bqto\b\s*(?:baru)?\s*$/,
  },
  // SYNC_QTO "semua" — HARUS sebelum pola SYNC bernama (lihat
  // catatan urutan di atas). Param = "semua qto" (+ "ke rab"
  // opsional); handler mendeteksi "semua" sebagai perintah massal.
  {
    intent: 'SYNC_QTO',
    re: /\b(?:sinkron(?:kan|isasi)?|sync)\b.*\b(semua\s+(?:item\s+)?qto(?:\s+ke\s+rab)?)\s*$/,
    paramGroup: true,
  },
  // SYNC_QTO bernama ber-"qto": "sinkronkan qto galian ke rab",
  // "sinkronkan qto galian". Param = ekor sesudah "qto"; handler
  // membuang akhiran "ke rab" via parseSyncQtoTarget.
  {
    intent: 'SYNC_QTO',
    re: /\b(?:sinkron(?:kan|isasi)?|sync)\b.*\bqto\b\s+(.+)/,
    paramGroup: true,
  },
  // SYNC_QTO bernama tanpa kata "qto": "sinkronkan galian ke rab",
  // "sinkronkan semua ke rab" (param "semua" → massal di handler).
  // Dijangkar ke "ke rab" agar tidak menelan pertanyaan umum.
  {
    intent: 'SYNC_QTO',
    re: /\b(?:sinkron(?:kan|isasi)?|sync)\b\s+(.+?)\s+ke\s+rab\s*$/,
    paramGroup: true,
  },
  // SYNC_QTO telanjang → klarifikasi ("sinkronkan qto",
  // "sinkronkan qto ke rab" tanpa nama — pola bernama di atas
  // menangkapnya dengan param "ke rab" dan handler memperlakukannya
  // sebagai kosong juga; pola ini menangkap bentuk tanpa "ke rab").
  {
    intent: 'SYNC_QTO',
    re: /^\s*(?:tolong\s+)?(?:sinkron(?:kan|isasi)?|sync)\b.*\bqto\b\s*(?:ke\s+rab)?\s*$/,
  },
];

/** Prompt klarifikasi router (param kosong) — disalin verbatim ke
 *  cabang klarifikasi routeIntent oleh koordinator. */
export const CREATE_QTO_CLARIFICATION =
  'Buat item QTO apa, berapa volume dan satuannya? Contoh: "buat item QTO galian tanah 10 m3".';
export const SYNC_QTO_CLARIFICATION =
  'Sinkronkan QTO yang mana ke RAB? Contoh: "sinkronkan QTO galian ke RAB" atau "sinkronkan semua QTO".';

/* ------------------------------------------------------------------ */
/* Konteks lokal (JANGAN impor ChatActionContext untuk signature      */
/* handler — callback QTO belum ada di sana; koordinator menambahkan  */
/* ketiga field ini ke ChatActionContext dan view mengisinya).        */
/* ------------------------------------------------------------------ */

/**
 * Bentuk SATU item QTO yang dibaca chat — proyeksi minimal QTOItem
 * (src/types/index.ts:890). View memetakannya dari projectQtoItems
 * (useProject, ProjectContext.tsx:1106-1108 — qtoItems yang sudah
 * difilter ke proyek aktif; sumber yang sama dengan
 * QtoRekapVolumeView). Snapshot chat (projectContext.ts) TIDAK memuat
 * QTO — karena itu daftar dibaca lewat callback, bukan snapshot.
 *
 * Penanda "tanpa harga" (cermin decideQtoSyncPrice, qtoSyncPricing.ts):
 * `unitPrice` null/undefined (kontrak QTOItem: null/undefined = belum
 * ada harga, BUKAN Rp0) ATAU `priceUnit` terisi tapi tidak sama dengan
 * `unit` (satuan harga tersimpan tidak cocok → harga tidak
 * ditransfer). Lihat qtoHasTransferablePrice.
 */
export interface QtoChatItem {
  id: string;
  uraian: string;
  quantity: number;
  unit: string;
  kode?: string;
  /** Harga satuan tersimpan (Rp per priceUnit). null/undefined = tanpa harga. */
  unitPrice?: number | null;
  /** Satuan yang dipakai unitPrice tersimpan — wajib cocok dengan `unit`. */
  priceUnit?: string;
}

/** Input pembuatan item QTO — cermin subset data createManualQtoItem. */
export interface CreateQtoItemInput {
  uraian: string;
  quantity: number;
  unit: string;
}

export interface QtoCommandContext {
  activeProject: { id: string; name: string } | null;
  /**
   * Membuat item QTO manual di proyek aktif (view membungkus
   * createManualQtoItem, ProjectContext.tsx:1886 — fungsi itu
   * MELEMPAR bila tanpa proyek aktif; callback view menangkap throw
   * menjadi null). Mengembalikan { id, kode } item yang dibuat, atau
   * null bila gagal.
   */
  createQtoItem?: (input: CreateQtoItemInput) => { id: string; kode: string } | null;
  /**
   * Daftar item QTO proyek aktif (view memetakan projectQtoItems dari
   * useProject — sumber yang sama dengan QtoRekapVolumeView).
   */
  listQtoItems?: () => QtoChatItem[];
  /**
   * Mensinkron SATU item QTO ke RAB (view membungkus
   * syncQtoToRabSpreadsheet(id), ProjectContext.tsx:1743 — fungsi itu
   * MELEMPAR bila item tidak ditemukan / tanpa proyek aktif; callback
   * view menangkap throw menjadi false). true = tersinkron.
   */
  syncQtoItem?: (qtoItemId: string) => boolean;
}

/* ------------------------------------------------------------------ */
/* Parser / helper (diekspor agar bisa dites langsung)                */
/* ------------------------------------------------------------------ */

/**
 * Regex yang SAMA dengan yang dipakai parseRequestedQuantity
 * (chatAnswerTransfer.ts) — dipakai HANYA untuk menemukan span angka
 * +satuan di dalam param agar bisa dibuang dari uraian. NILAI volume
 * +satuan selalu diambil dari parseRequestedQuantity, bukan dari
 * match lokal ini.
 */
const QUANTITY_SPAN_RE =
  /(\d+(?:[.,]\d+)?)\s*(m\s*2|m²|m\s*3|m³|kg|m'|buah|unit|titik|ls)(?![a-z0-9])/i;

/** Angka telanjang di akhir teks ("galian tanah 10") — kandidat volume
 *  yang satuannya masih harus ditanyakan. Mensyaratkan spasi sebelum
 *  angka sehingga rasio ("plesteran 1:4", angka "4" didahului ":") dan
 *  mutu ("beton k225", didahului "k") TIDAK salah dibaca sebagai
 *  volume. */
const BARE_TRAILING_NUMBER_RE = /\s(\d+(?:[.,]\d+)?)\s*$/;

export interface CreateQtoTarget {
  /** Uraian bersih (tanpa span kuantitas, tanpa kata pengisi). */
  uraian: string;
  /** Volume + satuan dari parseRequestedQuantity (null bila tidak ada). */
  quantity: number | null;
  unit: string | null;
  /** Angka telanjang di akhir bila parseRequestedQuantity gagal
   *  (volumenya ada, satuannya belum — handler menanyakan satuannya). */
  bareVolume: number | null;
}

function cleanQtoUraian(raw: string): string {
  let s = String(raw ?? '').replace(/\s+/g, ' ').trim();
  // Awalan pengisi ("item", "baru") — param router sudah melewati kata
  // "qto", tapi redaksi ganda ("buat qto item galian") tetap dibersihkan.
  s = s.replace(/^(?:item\s+)?(?:baru\s+)?/i, '');
  // Akhiran pengisi ("ke qto", "di proyek ini").
  s = s.replace(/\s+(?:ke|di|untuk)\s+qto\s*$/i, '');
  s = s.replace(/\s+di\s+proyek\s+ini\s*$/i, '');
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Uraian + volume + satuan dari param CREATE_QTO_ITEM
 * ("galian tanah 10 m3" → { uraian: "galian tanah", quantity: 10,
 * unit: "m3" }). Volume+satuan dari parseRequestedQuantity (satuan
 * 'm' telanjang TIDAK diterima — "10 m" adalah jarak, bukan volume;
 * meter lari ditulis m'). Tanpa satuan yang disebut, quantity/unit
 * null dan handler bertanya (tidak pernah default ke m³).
 */
export function parseCreateQtoTarget(param: string | undefined): CreateQtoTarget {
  const raw = String(param ?? '').replace(/\s+/g, ' ').trim();
  const qty = parseRequestedQuantity(raw);
  let uraianText = raw;
  if (qty) {
    // Buang span kuantitas PERTAMA dari teks agar tidak masuk uraian.
    const m = raw.match(QUANTITY_SPAN_RE);
    if (m && m.index !== undefined) {
      uraianText = `${raw.slice(0, m.index)} ${raw.slice(m.index + m[0].length)}`;
    }
  }
  let uraian = cleanQtoUraian(uraianText);
  let bareVolume: number | null = null;
  if (!qty) {
    const bm = uraian.match(BARE_TRAILING_NUMBER_RE);
    if (bm) {
      const v = Number(bm[1].replace(',', '.'));
      if (Number.isFinite(v) && v > 0) {
        bareVolume = v;
        uraian = cleanQtoUraian(uraian.slice(0, bm.index));
      }
    }
  }
  return {
    uraian,
    quantity: qty ? qty.volume : null,
    unit: qty ? qty.unit : null,
    bareVolume,
  };
}

export type SyncQtoTarget =
  | { kind: 'all' }
  | { kind: 'named'; name: string }
  | { kind: 'empty' };
/**
 * Target SYNC_QTO dari param ("galian ke rab" → named "galian";
 * "semua qto ke rab" / "semua" → all; "ke rab" / kosong → empty).
 * "semua qto galian" BUKAN massal — "semua" di sana hanya penguat dan
 * namanya tetap "galian" (bila cocok dengan >1 item, handler menjawab
 * ambigu dengan kandidat; tidak pernah menebak).
 */
export function parseSyncQtoTarget(param: string | undefined): SyncQtoTarget {
  let s = String(param ?? '').replace(/\s+/g, ' ').trim();
  // Akhiran tujuan ("ke rab", "ke spreadsheet rab") — `(^|\s+)`
  // agar "ke rab" TELANJANG (tanpa nama di depannya) juga terbuang
  // menjadi kosong, bukan dianggap nama item.
  s = s.replace(/(^|\s+)ke\s+(?:spreadsheet\s+)?rab\s*$/i, '');
  s = s.replace(/(^|\s+)ke\s+spreadsheet\s*$/i, '');
  // Awalan pengisi ("qto", "item qto").
  s = s.replace(/^(?:item\s+)?qto\s+/i, '');
  s = s.replace(/\s+/g, ' ').trim();
  if (!s) return { kind: 'empty' };
  const tokens = s.toLowerCase().split(/\s+/);
  const hasSemua = tokens.includes('semua');
  const rest = tokens.filter((t) => t !== 'semua' && t !== 'qto' && t !== 'item');
  if (hasSemua && rest.length === 0) return { kind: 'all' };
  if (hasSemua) {
    // "semua qto galian" → nama = sisa sesudah membuang kata pengisi
    // (diambil dari teks asli agar kapitalisasi terjaga untuk kutipan).
    const name = s
      .split(/\s+/)
      .filter((t) => !/^(semua|qto|item)$/i.test(t))
      .join(' ')
      .trim();
    return name ? { kind: 'named', name } : { kind: 'empty' };
  }
  return { kind: 'named', name: s };
}

export interface QtoPriceCheck {
  priced: boolean;
  /** Alasan yang bisa ditampilkan ke user bila tidak berharga. */
  reason: string;
}

/**
 * Apakah harga tersimpan item QTO ini bisa ditransfer ke RAB?
 * CERMIN checkQtoStoredPriceTransfer (qtoSyncPricing.ts) — SATU-SATUNYA
 * definisi "tanpa harga" yang dipakai UI (QtoRekapVolumeView
 * handleRowSyncClick / handleBulkSyncToRab lewat decideQtoSyncPrice):
 *   - unitPrice null/undefined/bukan angka → tanpa harga;
 *   - priceUnit terisi tapi != unit (perbandingan string PERSIS seperti
 *     kanonis — 'm³' vs 'm3' DIANGGAP tidak cocok) → tanpa harga.
 * Satu pengencangan yang disengaja vs kanonis: unitPrice 0 juga
 * dianggap tanpa harga — Rp0 bukan harga nyata (sentinel), dan chat
 * tidak boleh mengklaim item berharga Rp0 "tersinkron dengan harga".
 */
export function qtoHasTransferablePrice(item: QtoChatItem): QtoPriceCheck {
  const stored = item.unitPrice;
  if (stored === undefined || stored === null || !Number.isFinite(stored)) {
    return { priced: false, reason: 'Item QTO belum memiliki harga tersimpan dari kalkulator.' };
  }
  if (stored <= 0) {
    return { priced: false, reason: 'Item QTO belum memiliki harga tersimpan dari kalkulator.' };
  }
  if (item.priceUnit && item.unit && item.priceUnit !== item.unit) {
    return {
      priced: false,
      reason: `Satuan harga tersimpan (${item.priceUnit}) tidak cocok dengan satuan QTO saat ini (${item.unit}) — harga tidak ditransfer agar tidak salah hitung.`,
    };
  }
  return { priced: true, reason: 'Harga tersimpan dari kalkulator QTO.' };
}

export type QtoItemResolution =
  | { kind: 'one'; item: QtoChatItem }
  | { kind: 'ambiguous'; candidates: QtoChatItem[] }
  | { kind: 'none' };

/**
 * Resolusi nama → item QTO. Cermin resolveTargetItem (operations.ts):
 * SEMUA kata query harus muncul di uraian+kode (huruf kecil). Satu
 * cocok → one; >1 → ambiguous dengan kandidat; 0 → none.
 */
export function resolveQtoItemByName(
  items: QtoChatItem[],
  name: string,
): QtoItemResolution {
  const q = String(name ?? '').trim().toLowerCase();
  if (!q) return { kind: 'none' };
  const words = q.split(/\s+/).filter(Boolean);
  const matches = items.filter((item) => {
    const hay = `${item.uraian} ${item.kode ?? ''}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
  if (matches.length === 1) return { kind: 'one', item: matches[0] };
  if (matches.length > 1) return { kind: 'ambiguous', candidates: matches };
  return { kind: 'none' };
}

/* ------------------------------------------------------------------ */
/* Format pesan                                                        */
/* ------------------------------------------------------------------ */

function formatQty(v: number): string {
  return String(v).replace('.', ',');
}

function formatRupiah(v: number): string {
  return `Rp${Math.round(v).toLocaleString('id-ID')}`;
}

/** Label satu item untuk dikutip di pesan: "Galian tanah" (10 m3). */
export function formatQtoItemLabel(item: QtoChatItem): string {
  return `"${item.uraian}" (${formatQty(item.quantity)} ${item.unit})`;
}

/**
 * Daftar nama berbutir, maks `max` nama lalu "dan N item lainnya" —
 * pembatasan tampil, BUKAN pembuangan diam-diam: jumlah sisanya selalu
 * disebut eksplisit.
 */
function bulletNames(items: QtoChatItem[], max: number): string {
  const shown = items.slice(0, max).map((i) => `• ${formatQtoItemLabel(i)}`);
  const rest = items.length - shown.length;
  if (rest > 0) shown.push(`• dan ${rest} item lainnya`);
  return shown.join('\n');
}

const REKAP_QTO_BUTTON: ChatActionButton = {
  label: 'Buka Rekap QTO',
  action: { kind: 'navigate', menu: 'qto' },
};

const NO_ACTIVE_PROJECT_MSG =
  'Tidak ada proyek aktif. Buka salah satu proyek dulu di Daftar Proyek, lalu ulangi perintahnya.';

/* ------------------------------------------------------------------ */
/* Handler                                                             */
/* ------------------------------------------------------------------ */

function handleCreateQtoItem(
  param: string | undefined,
  ctx: QtoCommandContext,
): ActionResult {
  const target = parseCreateQtoTarget(param);
  if (!target.uraian) {
    return { ok: true, message: CREATE_QTO_CLARIFICATION };
  }
  if (target.quantity === null || target.unit === null) {
    // Volume disebut tanpa satuan → tanyakan SATUANNYA saja (volume
    // dikutip agar user bisa mengoreksi bila salah baca). Tanpa angka
    // sama sekali → tanyakan volume + satuan. Tidak pernah default ke
    // m³ — satuan wajib disebut eksplisit oleh user.
    if (target.bareVolume !== null) {
      return {
        ok: true,
        message: `Volume "${target.uraian}" ${formatQty(target.bareVolume)} — satuannya apa? Contoh: m2, m3, kg, atau m' untuk meter lari.`,
      };
    }
    return {
      ok: true,
      message: `"${target.uraian}" volumenya berapa dan satuannya apa? Contoh: "buat item QTO ${target.uraian} 10 m3".`,
    };
  }
  if (!ctx.activeProject) {
    return { ok: true, message: NO_ACTIVE_PROJECT_MSG };
  }
  if (!ctx.createQtoItem) {
    return {
      ok: false,
      message: 'Saya belum bisa membuat item QTO dari chat ini. Buat lewat menu Rekap QTO (tombol Tambah Manual).',
    };
  }
  const created = ctx.createQtoItem({
    uraian: target.uraian,
    quantity: target.quantity,
    unit: target.unit,
  });
  if (!created) {
    return {
      ok: false,
      message: `Item QTO "${target.uraian}" belum dibuat — proyek "${ctx.activeProject.name}" tidak ditemukan saat menyimpan. Coba pilih ulang proyeknya di Daftar Proyek, lalu ulangi perintahnya.`,
    };
  }
  const kodePart = created.kode ? ` — kode ${created.kode}` : '';
  return {
    ok: true,
    message: `Item QTO ${formatQtoItemLabel({ id: created.id, uraian: target.uraian, quantity: target.quantity, unit: target.unit })} dibuat di proyek "${ctx.activeProject.name}"${kodePart}.`,
  };
}

function handleSyncQto(
  param: string | undefined,
  ctx: QtoCommandContext,
): ActionResult {
  const target = parseSyncQtoTarget(param);
  if (target.kind === 'empty') {
    return { ok: true, message: SYNC_QTO_CLARIFICATION };
  }
  if (!ctx.activeProject) {
    return { ok: true, message: NO_ACTIVE_PROJECT_MSG };
  }
  if (!ctx.listQtoItems || !ctx.syncQtoItem) {
    return {
      ok: false,
      message: 'Saya belum bisa menyinkronkan QTO dari chat ini. Sinkronkan lewat menu Rekap QTO (tombol sinkron pada tiap item).',
    };
  }
  const items = ctx.listQtoItems();
  const projectName = ctx.activeProject.name;

  if (target.kind === 'all') {
    if (items.length === 0) {
      return {
        ok: true,
        message: `Belum ada item QTO di proyek "${projectName}". Buat dulu dengan "buat item QTO galian tanah 10 m3".`,
      };
    }
    // Hanya item BERHARGA yang disinkron; item tanpa harga dilewati
    // dan dilaporkan DENGAN NAMANYA (tidak pernah dibuang diam-diam).
    const priced: QtoChatItem[] = [];
    const unpriced: QtoChatItem[] = [];
    for (const item of items) {
      (qtoHasTransferablePrice(item).priced ? priced : unpriced).push(item);
    }
    const synced: QtoChatItem[] = [];
    const failed: QtoChatItem[] = [];
    for (const item of priced) {
      if (ctx.syncQtoItem(item.id)) synced.push(item);
      else failed.push(item);
    }
    const parts: string[] = [];
    if (synced.length > 0) {
      parts.push(
        `${synced.length} item QTO disinkronkan ke RAB:\n${bulletNames(synced, 10)}`,
      );
    } else {
      parts.push('Belum ada item QTO yang disinkronkan.');
    }
    if (unpriced.length > 0) {
      parts.push(
        `${unpriced.length} item belum memiliki harga sehingga dilewati:\n${bulletNames(unpriced, 10)}\nIsi harga satuannya dulu lewat kalkulator, atau sinkronkan tanpa harga lewat Rekap QTO (di sana ada dialog konfirmasi).`,
      );
    }
    if (failed.length > 0) {
      parts.push(
        `${failed.length} item gagal disinkronkan:\n${bulletNames(failed, 10)}\nCoba lagi lewat Rekap QTO.`,
      );
    }
    return {
      ok: failed.length === 0,
      message: parts.join('\n\n'),
      ...(unpriced.length > 0 || failed.length > 0 ? { actions: [REKAP_QTO_BUTTON] } : {}),
    };
  }

  // Named sync
  const resolved = resolveQtoItemByName(items, target.name);
  if (resolved.kind === 'none') {
    if (items.length === 0) {
      return {
        ok: false,
        message: `Tidak ada item QTO yang cocok dengan "${target.name}" — belum ada item QTO di proyek "${projectName}". Buat dulu dengan "buat item QTO ${target.name} 10 m3".`,
      };
    }
    return {
      ok: false,
      message: `Tidak ada item QTO yang cocok dengan "${target.name}" di proyek "${projectName}". Item QTO yang ada:\n${bulletNames(items, 5)}\nPeriksa namanya, atau buat dulu dengan "buat item QTO ${target.name} 10 m3".`,
    };
  }
  if (resolved.kind === 'ambiguous') {
    return {
      ok: false,
      message: `Ada ${resolved.candidates.length} item QTO yang cocok dengan "${target.name}":\n${bulletNames(resolved.candidates, 10)}\nSebutkan yang mana — contoh: "sinkronkan QTO ${resolved.candidates[0].uraian} ke RAB".`,
    };
  }
  const item = resolved.item;
  const price = qtoHasTransferablePrice(item);
  if (!price.priced) {
    // Cermin alur pendingUnpricedSync di UI (QtoRekapVolumeView
    // :324-374): item tanpa harga butuh persetujuan eksplisit — chat
    // tidak punya dialog itu, jadi TIDAK sync dan TIDAK mengklaim
    // tersinkron; user diarahkan ke Rekap QTO (dialognya ada di sana).
    return {
      ok: true,
      message: `Item ${formatQtoItemLabel(item)} ${price.reason} Item ini belum saya sinkronkan — bila disinkronkan, item RAB-nya dibuat tanpa harga ("Harga belum diisi", bukan Rp0). Isi harga satuannya dulu lewat kalkulator, atau sinkronkan tanpa harga lewat Rekap QTO (di sana ada dialog konfirmasi)?`,
      actions: [REKAP_QTO_BUTTON],
    };
  }
  const ok = ctx.syncQtoItem(item.id);
  if (!ok) {
    return {
      ok: false,
      message: `Item ${formatQtoItemLabel(item)} belum tersinkron — penyimpanan RAB gagal saat sinkronisasi. Coba lagi lewat Rekap QTO.`,
    };
  }
  const priceNote =
    item.unitPrice !== undefined && item.unitPrice !== null
      ? ` dengan harga tersimpan ${formatRupiah(item.unitPrice)}/${item.unit}`
      : '';
  return {
    ok: true,
    message: `Item ${formatQtoItemLabel(item)} disinkronkan ke RAB${priceNote}.`,
  };
}

/**
 * Entry point handler kelompok QTO. Mengembalikan null bila intent
 * bukan milik kelompok ini (koordinator memanggilnya dari case
 * CREATE_QTO_ITEM / SYNC_QTO di executeIntent).
 */
export function handleQtoCommand(
  intent: string,
  param: string | undefined,
  ctx: QtoCommandContext,
): ActionResult | null {
  if (intent === QTO_CREATE_INTENT) return handleCreateQtoItem(param, ctx);
  if (intent === QTO_SYNC_INTENT) return handleSyncQto(param, ctx);
  return null;
}

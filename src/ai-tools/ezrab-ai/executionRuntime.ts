/**
 * EZRAB AI — Persistent Execution Runtime (Chat AI lifecycle fix, 2026-11-12)
 *
 * Lapisan eksekusi AI setingkat APLIKASI: kepemilikan request hidup di modul
 * ini (singleton), BUKAN di komponen halaman Chat AI. EzrabAiView boleh
 * unmount kapan saja (navigasi menu) tanpa membatalkan pekerjaan AI yang
 * sedang berjalan: promise, AbortController, status, dan token keaktualan
 * hidup di sini; UI hanya BERLANGGANAN ke keadaan eksekusi.
 *
 * Prinsip:
 * - Navigasi BUKAN pembatalan. Hanya cancelRequest eksplisit pengguna
 *   (atau kondisi terminal eksekusi) yang meng-abort signal.
 * - Satu eksekusi = satu conversationId + satu projectId. Request tetap
 *   terikat proyek asalnya meski pengguna berganti proyek di tengah jalan.
 * - Hasil akhir ditulis ke unifiedConversationStore oleh pekerjaan itu
 *   sendiri (melalui persistMessage view yang beroperasi pada singleton
 *   store) — penyelesaian tidak bergantung pada komponen ter-mount.
 * - Transport aplikasi bukan stream token (providerClient: satu fetch +
 *   resp.json utuh); yang dipertahankan runtime adalah status eksekusi,
 *   signal, dan hasil final. "Parsial" yang ada = pesan pengguna yang
 *   sudah terpersisten + status generating.
 * - Reload browser TIDAK dapat dilanjutkan runtime ini (memori hilang).
 *   Jaminan reload adalah penanda INTERRUPTED yang diturunkan view dari
 *   store (pesan pengguna terakhir tanpa balasan + tidak ada eksekusi
 *   hidup) + aksi Coba Lagi manual — tidak pernah auto-resubmit.
 *
 * Bukan store kedua: modul ini TIDAK menyimpan isi percakapan (itu tugas
 * unifiedConversationStore) dan TIDAK menjalankan AI sendiri (itu tugas
 * ezrabAiService). Ia hanya memiliki EKSEKUSI yang sedang berjalan.
 *
 * P2 (2026-11-13) — state eksekusi nyata: setiap record membawa `stage`
 * (tahap terakhir yang BENAR-BENAR terjadi) + `stageHistory` (log event
 * tahap berstempel waktu). Tahap HANYA dipancarkan dari event eksekusi
 * nyata lewat emitExecutionStage — tidak ada persen, tidak ada timer,
 * tidak ada tahap yang ditebak. Tahap yang tidak punya event nyata
 * (mis. sub-tahap di dalam satu fetch non-streaming) TIDAK dipancarkan
 * dan TIDAK ditampilkan sebagai progres berjalan. `result` menyimpan
 * hasil akhir eksekusi modal spreadsheet (preview item AI) agar selamat
 * dari navigasi/tutup-buka modal; eksekusi Chat AI tidak memakainya
 * (hasilnya hidup di unifiedConversationStore).
 *
 * S8 (2026-11-13, ARS-08) — dua pengerasan gerbang + kebersihan:
 * (1) `isCurrent()` kini false untuk record TERMINAL, bukan hanya untuk
 * record yang digantikan: sebelumnya handle eksekusi yang dibatalkan
 * tetap "current" (cancel tidak mengubah latest/superseded), sehingga
 * cancel yang tiba sesudah gerbang timing minimum berlalu lolos ke
 * penulisan pesan gagal di view. (2) `pruneStaleExecutions()` membersihkan
 * record basi: eksekusi tersupersede yang idle melewati ambang
 * (EXECUTION_STALE_AFTER_MS) diinterupsi + sinyalnya di-abort — hasilnya
 * memang sudah digerbangi keluar di semua tempat — dan record terminal
 * non-latest tanpa `result` dihapus. Ambang menghormati pin NAV-03 /
 * F6-L2 / P5A-12 (supersede segar TIDAK PERNAH di-abort paksa): prune
 * hanya menyentuh yang sudah idle melewati horizon request maksimum.
 * Prune TIDAK PERNAH menyentuh record latest percakapan mana pun,
 * eksekusi aktif yang bukan superseded, atau record yang membawa
 * `result` (pratinjau modal) — dan modul ini tidak mengimpor store
 * percakapan/draft apa pun, sehingga prune secara struktural tidak
 * dapat menghapus draft sah.
 */

export type AiExecutionStatus =
  | 'preparing'
  | 'generating'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'interrupted';

/**
 * P2 — Tahap eksekusi yang DAPAT dipancarkan dari event nyata.
 * Setiap nilai dipetakan ke SATU titik emisi di kode (lihat pemakai
 * emitExecutionStage): 'preparing' = eksekusi dimulai; 'reading-documents'
 * = seksi DED/QTO ikut dalam kirim; 'contacting-model' = sebelum fetch
 * provider; 'identifying-items' / 'calculating-quantities' /
 * 'mapping-ahsp' / 'checking-prices' = tool call bernama itu dieksekusi
 * (service.stageForToolCall); 'running-tools' = tool call lain;
 * 'validating' = gerbang kualitas / parse hasil berjalan; 'awaiting-review'
 * = draft/rencana/pratinjau sudah disajikan dan menunggu keputusan
 * pengguna. 'completed'/'failed'/'cancelled' = terminal, diisi
 * finishExecution/cancelExecution.
 *
 * YANG SENGAJA TIDAK ADA: 'menyusun WBS' dan 'menghitung biaya' —
 * keduanya sinkron di dalam build draft / computeTotals tanpa event
 * antar-langkah, sehingga tidak dapat dipancarkan secara jujur; juga
 * tidak ada tahap antar-token karena transport bukan streaming.
 */
export type ExecutionStage =
  | 'preparing'
  | 'reading-documents'
  | 'contacting-model'
  | 'identifying-items'
  | 'calculating-quantities'
  | 'mapping-ahsp'
  | 'checking-prices'
  | 'running-tools'
  | 'validating'
  | 'awaiting-review'
  | 'completed'
  | 'failed'
  | 'cancelled';

/** Label UI Bahasa Indonesia per tahap (tanpa persen — bukan progres). */
export const EXECUTION_STAGE_LABELS: Record<ExecutionStage, string> = {
  preparing: 'Menyiapkan input…',
  'reading-documents': 'Membaca dokumen…',
  'contacting-model': 'Menghubungi model…',
  'identifying-items': 'Mengidentifikasi pekerjaan…',
  'calculating-quantities': 'Menghitung kuantitas…',
  'mapping-ahsp': 'Memetakan AHSP…',
  'checking-prices': 'Memeriksa harga…',
  'running-tools': 'Menjalankan alat…',
  validating: 'Memvalidasi hasil…',
  'awaiting-review': 'Menunggu review Anda',
  completed: 'Selesai',
  failed: 'Gagal',
  cancelled: 'Dibatalkan',
};

export interface ExecutionStageEvent {
  stage: ExecutionStage;
  at: number;
}

export interface AiExecutionRecord {
  requestId: string;
  conversationId: string;
  projectId: string;
  status: AiExecutionStatus;
  startedAt: number;
  completedAt: number | null;
  error: string | null;
  /** Kunci idempotensi operasi ini (satu kunci per operasi kirim). */
  idempotencyKey: string;
  /** true bila record ini sudah digantikan eksekusi yang lebih baru pada percakapan yang sama. */
  superseded: boolean;
  /** P2 — tahap terakhir yang benar-benar terjadi pada eksekusi ini. */
  stage: ExecutionStage;
  /** P2 — log event tahap (urutan kejadian, bukan state machine). */
  stageHistory: ExecutionStageEvent[];
  /**
   * P2 — hasil akhir eksekusi (hanya dipakai alur modal spreadsheet:
   * `{ item, prompt }` pratinjau AI). Chat AI tidak memakainya.
   * Hanya diisi saat finish 'completed'; cancel/gagal tidak menyimpan.
   */
  result?: unknown;
}

export interface AiExecutionHandle {
  record: AiExecutionRecord;
  /** Signal milik runtime — TIDAK terikat lifecycle komponen mana pun. */
  signal: AbortSignal;
  /**
   * true hanya bila record ini masih eksekusi terbaru pada percakapannya
   * DAN masih hidup (preparing/generating). S8: record TERMINAL
   * (cancelled/completed/failed) BUKAN current — sebelumnya cancel tidak
   * mengubah latest/superseded sehingga handle yang dibatalkan tetap
   * "current" dan hasil terlambatnya lolos gerbang view.
   */
  isCurrent: () => boolean;
}

export type AiExecutionListener = (record: AiExecutionRecord | null) => void;

function newRequestId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') return `req-${c.randomUUID()}`;
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function newIdempotencyKey(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `ezrab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

interface ActiveEntry {
  record: AiExecutionRecord;
  controller: AbortController;
  listeners: Set<AiExecutionListener>;
}

/**
 * Registry eksekusi. `records` menyimpan SEMUA record per requestId
 * (pekerjaan lama yang digantikan tetap dapat dibaca statusnya oleh
 * pemiliknya — mis. catch submit lama memeriksa 'cancelled'); `latest`
 * menunjuk record terbaru per conversationId (untuk status saat remount).
 * Record terminal yang bukan latest dibersihkan saat eksekusi baru dimulai,
 * agar map tidak tumbuh tanpa batas dalam satu sesi.
 */
const records = new Map<string, ActiveEntry>();
const latest = new Map<string, string>();
/** Placeholder langganan per percakapan sebelum eksekusi pertama (tidak masuk `records`). */
const placeholders = new Map<string, ActiveEntry>();

/** Salinan record untuk luar modul (stageHistory ikut disalin — pembaca tidak boleh memutasinya). */
function snapshotRecord(entry: ActiveEntry): AiExecutionRecord {
  return { ...entry.record, stageHistory: [...entry.record.stageHistory] };
}

function notify(entry: ActiveEntry | null): void {
  if (!entry) return;
  const snapshot: AiExecutionRecord = snapshotRecord(entry);
  entry.listeners.forEach((fn) => {
    try {
      fn(snapshot);
    } catch {
      /* listener yang gagal tidak boleh merusak eksekusi */
    }
  });
}

function latestEntry(conversationId: string): ActiveEntry | undefined {
  const id = latest.get(conversationId);
  if (id) return records.get(id);
  return placeholders.get(conversationId);
}

/**
 * Memulai eksekusi baru pada sebuah percakapan. Eksekusi aktif sebelumnya
 * pada percakapan yang sama (bila ada) ditandai `superseded` — hasilnya
 * tidak boleh lagi menimpa keadaan (isCurrent() menjadi false), tetapi
 * pekerjaannya TIDAK di-abort secara paksa di sini; pemilik pekerjaan
 * lama bertanggung jawab berhenti di titik cek berikutnya. (Pin NAV-03 /
 * F6-L2 / P5A-12 — dipertahankan S8. Penghentian paksa HANYA terjadi di
 * pruneStaleExecutions untuk yang sudah basi melewati ambang, dipanggil
 * di bawah sebagai sapuan kebersihan.)
 */
export function beginExecution(
  conversationId: string,
  projectId: string,
  idempotencyKey?: string,
): AiExecutionHandle {
  const previous = latestEntry(conversationId);
  if (previous && (previous.record.status === 'preparing' || previous.record.status === 'generating')) {
    previous.record.superseded = true;
    notify(previous);
  }
  // S8 — sapu record basi (semua percakapan) SEBELUM record baru
  // didaftarkan: eksekusi tersupersede yang idle melewati ambang
  // diinterupsi (sinyalnya di-abort sehingga fetch-nya berhenti;
  // hasilnya memang sudah digerbangi keluar), record terminal
  // non-latest tanpa result dihapus. Urutan ini penting: notifikasi
  // 'interrupted' tidak datang sesudah notifikasi eksekusi baru, dan
  // record previous (masih latest saat ini) tidak terhapus — konsisten
  // dengan pin PER-02. Ambang menjamin supersede segar (idle
  // milidetik) TIDAK PERNAH diinterupsi di sini.
  pruneStaleExecutions(undefined, Date.now());
  // Bersihkan record terminal lama yang bukan latest (anti-bocor memori).
  for (const [id, e] of records) {
    if (
      e.record.conversationId === conversationId &&
      e.record.requestId !== previous?.record.requestId &&
      e.record.status !== 'preparing' &&
      e.record.status !== 'generating'
    ) {
      records.delete(id);
    }
  }
  const startedAt = Date.now();
  const record: AiExecutionRecord = {
    requestId: newRequestId(),
    conversationId,
    projectId,
    status: 'generating',
    startedAt,
    completedAt: null,
    error: null,
    idempotencyKey: idempotencyKey ?? newIdempotencyKey(),
    superseded: false,
    stage: 'preparing',
    stageHistory: [{ stage: 'preparing', at: startedAt }],
    result: undefined,
  };
  const controller = new AbortController();
  const entry: ActiveEntry = { record, controller, listeners: previous ? previous.listeners : new Set() };
  records.set(record.requestId, entry);
  latest.set(conversationId, record.requestId);
  placeholders.delete(conversationId);
  notify(entry);
  return {
    record: snapshotRecord(entry),
    signal: controller.signal,
    isCurrent: () => {
      // S8: record terminal BUKAN current — cancel/finish tidak mengubah
      // latest/superseded, jadi tanpa cek status ini handle yang
      // dibatalkan tetap "current" dan hasil terlambatnya lolos gerbang.
      if (entry.record.status !== 'preparing' && entry.record.status !== 'generating') return false;
      const now = latestEntry(conversationId);
      return now === entry && !entry.record.superseded && entry.record.requestId === record.requestId;
    },
  };
}

/**
 * Menandai eksekusi selesai (sukses / gagal). Idempotent: record yang
 * sudah terminal tidak berubah — termasuk TIDAK menimpa `result`
 * (hasil terlambat sesudah cancel tidak pernah tersimpan).
 * P2: `result` (opsional) hanya disimpan bila outcome 'completed'
 * (dipakai alur modal spreadsheet). Stage terminal mengikuti outcome,
 * KECUALI 'awaiting-review' yang dipertahankan saat completed — eksekusi
 * selesai memproduksi, tapi hasilnya masih menunggu keputusan pengguna.
 */
export function finishExecution(
  requestId: string,
  outcome: 'completed' | 'failed',
  error?: string,
  result?: unknown,
): AiExecutionRecord | null {
  const entry = records.get(requestId);
  if (!entry) return null;
  if (entry.record.status !== 'preparing' && entry.record.status !== 'generating') return snapshotRecord(entry);
  entry.record.status = outcome;
  entry.record.completedAt = Date.now();
  entry.record.error = error ?? null;
  if (outcome === 'completed' && result !== undefined) entry.record.result = result;
  const terminalStage: ExecutionStage = outcome === 'completed' ? 'completed' : 'failed';
  if (!(outcome === 'completed' && entry.record.stage === 'awaiting-review')) {
    entry.record.stage = terminalStage;
    entry.record.stageHistory.push({ stage: terminalStage, at: Date.now() });
  }
  notify(entry);
  return snapshotRecord(entry);
}

/**
 * P2 — memancarkan satu tahap eksekusi dari EVENT NYATA. No-op (null)
 * bila record tidak ada, sudah terminal, sudah digantikan (superseded),
 * atau tahapnya sama dengan tahap terakhir (tanpa duplikat berurutan).
 * Pemanggil yang mengembalikan null TIDAK boleh mengasumsikan tahap
 * tercatat — itu artinya eksekusi sudah berakhir/dibatalkan dan langkah
 * berikutnya harus berhenti, bukan lanjut.
 */
export function emitExecutionStage(
  requestId: string,
  stage: ExecutionStage,
): AiExecutionRecord | null {
  const entry = records.get(requestId);
  if (!entry) return null;
  if (entry.record.status !== 'preparing' && entry.record.status !== 'generating') return null;
  if (entry.record.superseded) return null;
  if (entry.record.stage === stage) return snapshotRecord(entry);
  entry.record.stage = stage;
  entry.record.stageHistory.push({ stage, at: Date.now() });
  notify(entry);
  return snapshotRecord(entry);
}

/**
 * S9 — SATU-SATUNYA penurun tahap yang DILAPORKAN UI: tahap terakhir
 * dari LOG EVENT (stageHistory), bukan field `stage` mentah. Pelaporan
 * tahap dengan demikian deterministik dari event nyata: yang tampil
 * adalah tahap yang benar-benar dipancarkan — tidak pernah tahap yang
 * ditebak, tidak pernah tahap dari status, tidak pernah tahap tanpa
 * event. Mengembalikan null bila tidak ada event tahap sama sekali
 * (record placeholder / belum pernah dieksekusi) — placeholder membawa
 * `stage: 'completed'` dengan histori kosong, dan null di sinilah yang
 * jujur: belum ada eksekusi, belum ada tahap untuk dilaporkan.
 * Untuk semua record NYATA, hasilnya == record.stage (invarian dijaga
 * begin/emit/finish/cancel yang menulis keduanya bersamaan — dipin
 * suite S9); prune tidak menyentuh keduanya (tahap terakhir tetap
 * tahap nyata terakhir). UI membaca lewat fungsi ini (view.tsx gelembung
 * thinking + SmartAddWorkItemModal label tombol), bukan `.stage`.
 */
export function reportedExecutionStage(
  record: AiExecutionRecord | null | undefined,
): ExecutionStage | null {
  if (!record) return null;
  const h = record.stageHistory;
  if (h.length === 0) return null;
  return h[h.length - 1].stage;
}

/**
 * Pembatalan EKSPLISIT pengguna (direktif §4). Hanya operasi ini yang
 * berhenti: signal-nya di-abort, status menjadi 'cancelled', konten yang
 * sudah terpersisten tidak disentuh, eksekusi lain tidak terpengaruh.
 * Idempotent: memanggil dua kali pada request yang sama tidak mengubah
 * apa pun pada pemanggilan kedua.
 */
export function cancelExecution(requestId: string): AiExecutionRecord | null {
  const entry = records.get(requestId);
  if (!entry) return null;
  if (entry.record.status !== 'preparing' && entry.record.status !== 'generating') return snapshotRecord(entry);
  entry.record.status = 'cancelled';
  entry.record.completedAt = Date.now();
  // P2: tahap terminal 'cancelled' dicatat di histori — emisi tahap
  // sesudah ini ditolak emitExecutionStage (record terminal).
  entry.record.stage = 'cancelled';
  entry.record.stageHistory.push({ stage: 'cancelled', at: Date.now() });
  try {
    entry.controller.abort();
  } catch {
    /* abort tidak pernah boleh melempar */
  }
  notify(entry);
  return snapshotRecord(entry);
}

/**
 * S8 (2026-11-13) — Ambang basi untuk eksekusi yang sudah digantikan.
 * Dijangkar ke plafon timeout klien yang sudah ada di kode:
 * providerClient MAX_TIMEOUT_MS = 180.000 ms — tidak ada satu fetch
 * browser pun yang dapat hidup lebih lama dari itu (timeoutMs di-cap di
 * sana, +1 dtk timer). Record tersupersede yang idle melewati horizon
 * ini tidak lagi menjalankan request yang dapat kembali; ia hanya
 * menahan status 'generating' basi. Ambang ini SEKALIGUS masa tenggang
 * yang menghormati pin NAV-03 / F6-L2 / P5A-12 (pekerjaan yang baru
 * digantikan "boleh selesai diam-diam" — prune tidak pernah menyentuh
 * supersede segar yang idle milidetik/detik). Keamanan prune tidak
 * bergantung pada ambang: hasil record tersupersede sudah digerbangi
 * keluar di semua tempat (isCurrent false, emit no-op, gerbang commit
 * modal menolak), jadi menginterupsi-nya tidak pernah membuang hasil
 * yang dapat tampil.
 */
export const EXECUTION_STALE_AFTER_MS = 180_000;

export interface PruneStaleExecutionsReport {
  /** requestId record tersupersede-basi yang diinterupsi (status 'interrupted', sinyal di-abort). */
  interrupted: string[];
  /** requestId record terminal yang dihapus dari registry. */
  removed: string[];
}

function lastActivityAt(entry: ActiveEntry): number {
  const h = entry.record.stageHistory;
  if (h.length > 0) return h[h.length - 1].at;
  return entry.record.startedAt;
}

/**
 * S8 — membersihkan state eksekusi basi. Dua aksi, keduanya aman:
 *
 * 1. INTERRUPT — record yang tersupersede + masih aktif (preparing /
 *    generating) + idle melewati EXECUTION_STALE_AFTER_MS sejak aktivitas
 *    tahap terakhirnya: status menjadi 'interrupted' (BUKAN 'cancelled'
 *    — tidak ada pembatalan pengguna di sini, sehingga view TIDAK
 *    menampilkan penanda "Permintaan dibatalkan." yang keliru),
 *    completedAt dicatat, dan sinyalnya di-abort sehingga fetch yang
 *    menggantung berhenti (di server, disconnect ini mengaktifkan abort
 *    rantai gateway ARS-08). Record TIDAK dihapus pada sapuan ini agar
 *    pemiliknya masih dapat membaca status 'interrupted'-nya; ia baru
 *    layak dihapus pada sapuan berikutnya lewat aksi 2.
 * 2. REMOVE — record terminal (completed/failed/cancelled/interrupted)
 *    yang BUKAN latest percakapannya DAN tidak membawa `result`
 *    (pratinjau modal): dihapus dari registry.
 *
 * Yang TIDAK PERNAH disentuh: record latest percakapan mana pun, record
 * aktif yang bukan superseded, dan record yang membawa `result`.
 * Modul ini tidak mengimpor store percakapan/draft apa pun, sehingga
 * prune secara struktural tidak dapat menghapus draft sah — ia hanya
 * menyentuh registry eksekusi ini.
 *
 * Dipanggil otomatis dari beginExecution (sapuan global) dan
 * releaseConversation (sapuan per-percakapan); `now` dapat disuntik
 * untuk pengujian. Mengembalikan laporan requestId yang tersentuh.
 */
export function pruneStaleExecutions(
  conversationId?: string,
  now: number = Date.now(),
): PruneStaleExecutionsReport {
  const interrupted: string[] = [];
  const removed: string[] = [];
  const inScope = (e: ActiveEntry): boolean =>
    conversationId === undefined || e.record.conversationId === conversationId;
  // Pass 1 — interupsi record tersupersede yang basi.
  for (const entry of records.values()) {
    if (!inScope(entry)) continue;
    const rec = entry.record;
    if (!rec.superseded) continue;
    if (rec.status !== 'preparing' && rec.status !== 'generating') continue;
    if (now - lastActivityAt(entry) <= EXECUTION_STALE_AFTER_MS) continue;
    rec.status = 'interrupted';
    rec.completedAt = now;
    // Stage TIDAK diubah: tidak ada tahap 'interrupted' — tahap terakhir
    // yang tercatat tetap tahap nyata terakhir yang benar-benar terjadi.
    try {
      entry.controller.abort();
    } catch {
      /* abort tidak pernah boleh melempar */
    }
    interrupted.push(rec.requestId);
    notify(entry);
  }
  const interruptedSet = new Set(interrupted);
  // Pass 2 — hapus record terminal non-latest tanpa result. Record yang
  // baru diinterupsi pada pass 1 dilewati pada sapuan ini (agar pemiliknya
  // masih dapat membaca statusnya); sapuan berikutnya boleh menghapusnya.
  for (const [id, entry] of records) {
    if (!inScope(entry)) continue;
    if (interruptedSet.has(id)) continue;
    const rec = entry.record;
    if (rec.status === 'preparing' || rec.status === 'generating') continue;
    if (latest.get(rec.conversationId) === id) continue;
    if (rec.result !== undefined) continue;
    records.delete(id);
    removed.push(id);
  }
  return { interrupted, removed };
}

/** Eksekusi aktif (preparing/generating, bukan superseded) pada sebuah percakapan, bila ada. */
export function getActiveExecution(conversationId: string): AiExecutionRecord | null {
  const entry = latestEntry(conversationId);
  if (!entry) return null;
  if (!entry.record.superseded && (entry.record.status === 'preparing' || entry.record.status === 'generating')) {
    return snapshotRecord(entry);
  }
  return null;
}

/** Record terakhir pada sebuah percakapan (apa pun statusnya), bila ada. */
export function getLastExecution(conversationId: string): AiExecutionRecord | null {
  const entry = latestEntry(conversationId);
  return entry ? snapshotRecord(entry) : null;
}

export function getExecution(requestId: string): AiExecutionRecord | null {
  const entry = records.get(requestId);
  return entry ? snapshotRecord(entry) : null;
}

/**
 * Berlangganan perubahan status eksekusi pada sebuah percakapan.
 * Listener segera dipanggil sekali dengan keadaan saat ini (bila ada),
 * lalu pada setiap perubahan. Cleanup = unsubscribe SAJA — berlangganan
 * tidak pernah meng-abort eksekusi (inilah perbedaan dengan cleanup
 * unmount lama di view).
 */
export function subscribeExecution(
  conversationId: string,
  listener: AiExecutionListener,
): () => void {
  let entry = latestEntry(conversationId);
  if (!entry) {
    // Placeholder entry agar langganan tetap hidup sebelum eksekusi pertama;
    // digantikan (dengan listeners dipertahankan) oleh beginExecution.
    entry = {
      record: {
        requestId: '',
        conversationId,
        projectId: '',
        status: 'completed',
        startedAt: 0,
        completedAt: null,
        error: null,
        idempotencyKey: '',
        superseded: false,
        stage: 'completed',
        stageHistory: [],
        result: undefined,
      },
      controller: new AbortController(),
      listeners: new Set(),
    };
    placeholders.set(conversationId, entry);
  }
  entry.listeners.add(listener);
  try {
    listener(entry.record.requestId ? snapshotRecord(entry) : null);
  } catch {
    /* abaikan */
  }
  return () => {
    entry?.listeners.delete(listener);
  };
}

/** Melepas record sebuah percakapan (dipanggil saat percakapan dihapus). */
export function releaseConversation(conversationId: string): void {
  const entry = latestEntry(conversationId);
  if (!entry) return;
  if (entry.record.status === 'preparing' || entry.record.status === 'generating') {
    // Jangan membunuh pekerjaan yang berjalan hanya karena UI menutup
    // percakapan: biarkan selesai, record dipertahankan untuk dibaca.
    return;
  }
  // S8: sapu record basi percakapan ini sebelum melepas record latest —
  // record terminal non-latest dibersihkan dan eksekusi tersupersede
  // yang basi diinterupsi. Record latest tidak disentuh prune;
  // penghapusannya tetap oleh logika di bawah ini.
  pruneStaleExecutions(conversationId);
  if (entry.record.requestId) records.delete(entry.record.requestId);
  latest.delete(conversationId);
  placeholders.delete(conversationId);
}

/** Reset untuk pengujian otomatis (bukan bagian jalur produksi). */
export function __resetExecutionRuntimeForTests(): void {
  records.clear();
  latest.clear();
  placeholders.clear();
}

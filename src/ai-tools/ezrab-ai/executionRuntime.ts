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
 */

export type AiExecutionStatus =
  | 'preparing'
  | 'generating'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'interrupted';

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
}

export interface AiExecutionHandle {
  record: AiExecutionRecord;
  /** Signal milik runtime — TIDAK terikat lifecycle komponen mana pun. */
  signal: AbortSignal;
  /** true hanya bila record ini masih eksekusi terbaru pada percakapannya. */
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

function notify(entry: ActiveEntry | null): void {
  if (!entry) return;
  const snapshot: AiExecutionRecord = { ...entry.record };
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
 * lama bertanggung jawab berhenti di titik cek berikutnya.
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
  const record: AiExecutionRecord = {
    requestId: newRequestId(),
    conversationId,
    projectId,
    status: 'generating',
    startedAt: Date.now(),
    completedAt: null,
    error: null,
    idempotencyKey: idempotencyKey ?? newIdempotencyKey(),
    superseded: false,
  };
  const controller = new AbortController();
  const entry: ActiveEntry = { record, controller, listeners: previous ? previous.listeners : new Set() };
  records.set(record.requestId, entry);
  latest.set(conversationId, record.requestId);
  placeholders.delete(conversationId);
  notify(entry);
  return {
    record: { ...record },
    signal: controller.signal,
    isCurrent: () => {
      const now = latestEntry(conversationId);
      return now === entry && !entry.record.superseded && entry.record.requestId === record.requestId;
    },
  };
}

/** Menandai eksekusi selesai (sukses / gagal). Idempotent: record yang sudah terminal tidak berubah. */
export function finishExecution(
  requestId: string,
  outcome: 'completed' | 'failed',
  error?: string,
): AiExecutionRecord | null {
  const entry = records.get(requestId);
  if (!entry) return null;
  if (entry.record.status !== 'preparing' && entry.record.status !== 'generating') return { ...entry.record };
  entry.record.status = outcome;
  entry.record.completedAt = Date.now();
  entry.record.error = error ?? null;
  notify(entry);
  return { ...entry.record };
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
  if (entry.record.status !== 'preparing' && entry.record.status !== 'generating') return { ...entry.record };
  entry.record.status = 'cancelled';
  entry.record.completedAt = Date.now();
  try {
    entry.controller.abort();
  } catch {
    /* abort tidak pernah boleh melempar */
  }
  notify(entry);
  return { ...entry.record };
}

/** Eksekusi aktif (preparing/generating, bukan superseded) pada sebuah percakapan, bila ada. */
export function getActiveExecution(conversationId: string): AiExecutionRecord | null {
  const entry = latestEntry(conversationId);
  if (!entry) return null;
  if (!entry.record.superseded && (entry.record.status === 'preparing' || entry.record.status === 'generating')) {
    return { ...entry.record };
  }
  return null;
}

/** Record terakhir pada sebuah percakapan (apa pun statusnya), bila ada. */
export function getLastExecution(conversationId: string): AiExecutionRecord | null {
  const entry = latestEntry(conversationId);
  return entry ? { ...entry.record } : null;
}

export function getExecution(requestId: string): AiExecutionRecord | null {
  const entry = records.get(requestId);
  return entry ? { ...entry.record } : null;
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
      },
      controller: new AbortController(),
      listeners: new Set(),
    };
    placeholders.set(conversationId, entry);
  }
  entry.listeners.add(listener);
  try {
    listener(entry.record.requestId ? { ...entry.record } : null);
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

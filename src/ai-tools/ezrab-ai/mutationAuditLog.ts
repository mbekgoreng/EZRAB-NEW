/**
 * EZRAB AI — Jejak audit mutasi terstruktur sisi klien (P1-E, WC-11).
 *
 * Setiap mutasi §6 yang DIKONFIRMASI lewat Chat AI / DED mencatat satu
 * record: aktor, proyek (+id), operasi, nilai sebelum/sesudah, stempel
 * waktu, referensi konfirmasi, hasil eksekusi, dan kunci idempotensi.
 * Melengkapi (BUKAN menggantikan) jejak yang sudah ada: op log item
 * (operations.ts), kwitansi transfer (recordTransferReceipt), dan trail
 * eksekusi tool (toolRegistry.ts). Sebelum P1-E, perintah langsung
 * (proyek/pengaturan/QTO) TIDAK punya record sama sekali — hanya teks
 * pesan chat.
 *
 * ----------------------------------------------------------------------------
 *  BATAS KEJUJURAN (WC-11 — BACA SEBELUM MENYEBUT INI "AUDIT"):
 * ----------------------------------------------------------------------------
 *  Log ini TIDAK TAHAN-PERUSAKAN (not tamper-resistant): ia hidup di
 *  localStorage browser (`ezrab_ai_mutation_audit_v1`) yang dapat dibaca,
 *  diubah, atau dihapus siapa pun yang memegang browser itu. Ia adalah
 *  catatan riwayat untuk keterlacakan & debugging, BUKAN bukti audit
 *  forensik. Jejak audit yang tepercaya membutuhkan pencerminan ke
 *  server (`audit_logs` Supabase) — Tahap 5, di luar P1. JANGAN PERNAH
 *  mengklaim record di sini sebagai bukti yang tidak dapat disangkal.
 * ----------------------------------------------------------------------------
 *
 * Bentuk record dirancang untuk migrasi server di masa depan: medan-medan
 * di bawah memetakan 1:1 ke baris `audit_logs` (actor, project_id,
 * operation, before/after JSON, confirmation_ref, result, idempotency_key)
 * sehingga pencerminan nanti tidak butuh transformasi bentuk.
 *
 * Keterbatasan nilai sebelum/sesudah (jujur): registry Chat AI tidak
 * punya akses baca ke field proyek (pengaturan overhead/profit/dsb. hanya
 * ada di state React ProjectContext, dan persistensi di-debounce 400 ms
 * sehingga read-back localStorage sinkron akan membaca data BASI).
 * Karena itu `before` pada sebagian perintah adalah nilai proposal yang
 * dikonfirmasi (bukan pembacaan state pra-eksekusi), dan `outcomeVerified`
 * didasarkan pada sinyal sukses callback store (nilai balik mutator
 * kanonis) — BUKAN read-back pasca-tulis seperti pola async ChangePlan
 * (executePlan melakukan polling karena ia async; executeIntent sinkron
 * sehingga polling tidak dimungkinkan tanpa refactor besar). Keterbatasan
 * ini dicatat per record di `verificationNote`.
 */

export type MutationAuditResult =
  | 'executed' // mutasi diterapkan (sinyal sukses dari mutator)
  | 'failed' // mutasi dicoba tetapi mutator melaporkan gagal
  | 'denied'; // ditolak gerbang (kapabilitas / konfirmasi) — tanpa tulis

export interface MutationAuditRecord {
  /** ID unik record (juga dipakai sebagai kunci idempotensi tampilan). */
  id: string;
  /** Epoch ms saat eksekusi (bukan saat proposal). */
  ts: number;
  /** Nama aktor tampilan (nama peran demo / 'Peran demo'). BUKAN id
   *  pengguna terverifikasi — tidak ada identitas server di jalur ini. */
  actor: string;
  /** Proyek target (null untuk CREATE_PROJECT sebelum ada id — nama
   *  proyek tercatat di `after`). */
  projectId: string | null;
  projectName: string | null;
  /** Intent / kunci aksi (lihat mutationInventory.ts). */
  operation: string;
  /** Nilai sebelum (bila dapat dibaca di batas ini; null bila tidak
   *  tersedia — lihat `verificationNote`). */
  before: unknown;
  /** Nilai sesudah / proposal yang dikonfirmasi. */
  after: unknown;
  /** Referensi konfirmasi §6: sidik perintah langsung, payload
   *  two-step, kunci finalisasi, atau id binding transfer. */
  confirmationRef: string | null;
  result: MutationAuditResult;
  /** true bila mutator melaporkan sukses (sinyal callback). BUKAN
   *  read-back pasca-tulis — lihat header modul. */
  outcomeVerified: boolean;
  /** Penjelasan jujur tentang dasar verifikasi record ini. */
  verificationNote: string;
  /** Kunci idempotensi deterministik per aksi yang dikonfirmasi
   *  (operasi + sidik) — percobaan ulang atas proposal yang sama
   *  berbagi kunci ini; slot konfirmasi sekali pakai mencegah
   *  eksekusi ganda. */
  idempotencyKey: string;
  /** Permukaan asal: chat-ai | ded-ai. */
  source: 'chat-ai' | 'ded-ai';
  /** Pesan hasil (dipotong) untuk keterlacakan. */
  message?: string;
}

export type MutationAuditInput = Omit<MutationAuditRecord, 'id' | 'ts' | 'idempotencyKey'> & {
  /** Kunci idempotensi eksplisit (bila tidak diisi, diturunkan dari
   *  operation + confirmationRef). */
  idempotencyKey?: string;
};

const AUDIT_LOG_KEY = 'ezrab_ai_mutation_audit_v1';
const AUDIT_LOG_MAX = 500;
let memoryLog: MutationAuditRecord[] | null = null;
let auditCounter = 0;

function loadLog(): MutationAuditRecord[] {
  if (memoryLog) return memoryLog;
  try {
    const raw = (globalThis as unknown as { localStorage?: Storage }).localStorage?.getItem(AUDIT_LOG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        memoryLog = parsed as MutationAuditRecord[];
        return memoryLog;
      }
    }
  } catch { /* storage tak tersedia — jatuh ke memori */ }
  memoryLog = [];
  return memoryLog;
}

function saveLog(): void {
  try {
    (globalThis as unknown as { localStorage?: Storage }).localStorage?.setItem(
      AUDIT_LOG_KEY,
      JSON.stringify(loadLog().slice(-AUDIT_LOG_MAX)),
    );
  } catch { /* memori tetap menjadi sumber di sesi ini */ }
}

/** Khusus pengujian: jatuhkan cache memori agar pembacaan berikutnya
 * benar-benar memuat dari storage (simulasi refresh halaman). */
export function __resetMutationAuditLogForTests(): void {
  memoryLog = null;
  auditCounter = 0;
}

/** Kunci idempotensi deterministik per aksi yang dikonfirmasi. */
export function deriveMutationIdempotencyKey(operation: string, confirmationRef: string | null): string {
  const ref = confirmationRef ?? 'no-ref';
  let h1 = 5381;
  let h2 = 52711;
  const s = `${operation}§${ref}`;
  for (let k = 0; k < s.length; k++) {
    const c = s.charCodeAt(k);
    h1 = ((h1 << 5) + h1 + c) | 0;
    h2 = ((h2 << 5) + h2 - c) | 0;
  }
  return `${operation}:${(h1 >>> 0).toString(36)}.${(h2 >>> 0).toString(36)}`;
}

/** Tulis satu record audit mutasi (append-only di sesi ini). */
export function appendMutationAuditRecord(input: MutationAuditInput): MutationAuditRecord {
  auditCounter += 1;
  const rec: MutationAuditRecord = {
    id: `audit-${Date.now().toString(36)}-${auditCounter}`,
    ts: Date.now(),
    ...input,
    idempotencyKey:
      input.idempotencyKey ?? deriveMutationIdempotencyKey(input.operation, input.confirmationRef),
  };
  const log = loadLog();
  log.push(rec);
  while (log.length > AUDIT_LOG_MAX) log.shift();
  saveLog();
  return rec;
}

/** Daftar record audit (terbaru dulu), opsional disaring per proyek. */
export function listMutationAuditRecords(projectId?: string): MutationAuditRecord[] {
  const log = loadLog();
  const rows = log
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => !projectId || r.projectId === projectId);
  rows.sort((a, b) => (b.r.ts - a.r.ts) || (b.i - a.i));
  return rows.map(({ r }) => r);
}

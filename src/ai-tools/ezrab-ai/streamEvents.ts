/**
 * EZRAB AI — Kontrak event streaming (klien).
 *
 * Pasangan dari api/_lib/streamEvents.js (definisi ganda, dipin satu tes
 * kesepakatan di src/test/aiStreamingTransport.test.ts — server tidak bisa
 * mengimpor TS dan klien tidak boleh mengimpor api/_lib ke bundle).
 *
 * Event SSE server -> klien (satu stream = satu pesan asisten):
 *   message_start    -> append pesan dengan status 'streaming' (Fase 2)
 *   leg_start        -> leg failover baru dimulai (tanpa nama provider)
 *   content_delta    -> tambah `delta` ke konten provisional leg itu
 *   leg_failed       -> leg gagal (errorCode = klasifikasi aman)
 *   content_reset    -> HAPUS konten provisional leg gagal (jangan pernah
 *                       sambung dua completion berbeda menjadi satu jawaban)
 *   stage            -> tahap ExecutionStage (server belum memancarkan di
 *                       Fase 1; parser menerima untuk kompatibilitas maju)
 *   content_complete -> leg lengkap; konten provisional jadi final-sementara
 *   message_complete -> finalisasi (usage, durationMs, model alias)
 *   stream_error     -> gagal; konten parsial DIPERTAHANKAN, tampilkan
 *                       error ringkas + retry
 *
 * Tool events BUKAN SSE — tool dijalankan klien (service.ts), event-nya
 * client-side. Masking: tidak ada nama provider/model asli di event mana
 * pun; `model` di message_complete adalah alias tampil.
 */

import type { AiToolsUsageStatus } from '../providerClient';

/** Daftar kanonis tipe event SSE — WAJIB identik dengan server. */
export const STREAM_EVENT_TYPES = [
  'message_start',
  'leg_start',
  'content_delta',
  'leg_failed',
  'content_reset',
  'stage',
  'content_complete',
  'message_complete',
  'stream_error',
] as const;

export type StreamEventType = (typeof STREAM_EVENT_TYPES)[number];

export function isStreamEventType(v: unknown): v is StreamEventType {
  return typeof v === 'string' && (STREAM_EVENT_TYPES as readonly string[]).includes(v);
}

interface StreamEventBase {
  type: StreamEventType;
  messageId: string;
}

export interface StreamMessageStartEvent extends StreamEventBase {
  type: 'message_start';
  conversationId: string | null;
  requestId: string;
}

export interface StreamLegStartEvent extends StreamEventBase {
  type: 'leg_start';
  leg: number;
}

export interface StreamContentDeltaEvent extends StreamEventBase {
  type: 'content_delta';
  leg: number;
  delta: string;
}

export interface StreamLegFailedEvent extends StreamEventBase {
  type: 'leg_failed';
  leg: number;
  errorCode: string;
}

export interface StreamContentResetEvent extends StreamEventBase {
  type: 'content_reset';
  leg: number;
}

export interface StreamStageEvent extends StreamEventBase {
  type: 'stage';
  stage: string;
}

export interface StreamContentCompleteEvent extends StreamEventBase {
  type: 'content_complete';
  leg: number;
}

export interface StreamMessageCompleteEvent extends StreamEventBase {
  type: 'message_complete';
  requestId: string;
  /**
   * Usage mentah dari event (belum ternormalisasi). Pemanggil WAJIB
   * menormalisasi lewat normalizeAiUsage (providerClient) sebelum
   * dipakai — nilai absen tetap null, bukan 0.
   */
  usage: unknown;
  usageStatus: AiToolsUsageStatus;
  durationMs: number | null;
  /** Alias tampil per mode (masking) — BUKAN nama model asli. */
  model: string | null;
}

export interface StreamErrorEvent extends StreamEventBase {
  type: 'stream_error';
  errorCode: string;
  /** Pesan user-safe dari gateway (bukan teks error mentah provider). */
  message: string;
  retryable: boolean;
}

export type StreamEvent =
  | StreamMessageStartEvent
  | StreamLegStartEvent
  | StreamContentDeltaEvent
  | StreamLegFailedEvent
  | StreamContentResetEvent
  | StreamStageEvent
  | StreamContentCompleteEvent
  | StreamMessageCompleteEvent
  | StreamErrorEvent;

// ---------------------------------------------------------------------------
// Validasi event
// ---------------------------------------------------------------------------

const isNonEmptyString = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0;

const isValidLeg = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;

const USAGE_STATUSES: readonly AiToolsUsageStatus[] = [
  'measured',
  'measured_zero',
  'missing',
  'malformed',
];

/**
 * Validasi satu objek event hasil parse JSON. Mengembalikan event
 * bertipe atau null (malformed — pemanggil mengabaikan + mencatat, TIDAK
 * menggagalkan stream). Field ekstra yang tak dikenal diabaikan
 * (kompatibilitas maju); field wajib yang hilang/salah tipe menolak
 * event. `messageId` wajib di SEMUA event (korelasi + pencegah chunk
 * basi dari stream lain).
 */
export function validateStreamEvent(raw: unknown): StreamEvent | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (!isStreamEventType(r.type)) return null;
  if (!isNonEmptyString(r.messageId)) return null;
  const base = { type: r.type, messageId: r.messageId } as StreamEventBase;
  switch (r.type) {
    case 'message_start':
      return {
        ...base,
        type: 'message_start',
        conversationId: typeof r.conversationId === 'string' ? r.conversationId : null,
        requestId: typeof r.requestId === 'string' ? r.requestId : '',
      };
    case 'leg_start':
      if (!isValidLeg(r.leg)) return null;
      return { ...base, type: 'leg_start', leg: r.leg };
    case 'content_delta':
      if (!isValidLeg(r.leg)) return null;
      if (typeof r.delta !== 'string') return null;
      return { ...base, type: 'content_delta', leg: r.leg, delta: r.delta };
    case 'leg_failed':
      if (!isValidLeg(r.leg)) return null;
      if (!isNonEmptyString(r.errorCode)) return null;
      return { ...base, type: 'leg_failed', leg: r.leg, errorCode: r.errorCode };
    case 'content_reset':
      if (!isValidLeg(r.leg)) return null;
      return { ...base, type: 'content_reset', leg: r.leg };
    case 'stage':
      if (!isNonEmptyString(r.stage)) return null;
      return { ...base, type: 'stage', stage: r.stage };
    case 'content_complete':
      if (!isValidLeg(r.leg)) return null;
      return { ...base, type: 'content_complete', leg: r.leg };
    case 'message_complete': {
      const status =
        typeof r.usageStatus === 'string' &&
        (USAGE_STATUSES as readonly string[]).includes(r.usageStatus)
          ? (r.usageStatus as AiToolsUsageStatus)
          : 'missing';
      return {
        ...base,
        type: 'message_complete',
        requestId: typeof r.requestId === 'string' ? r.requestId : '',
        usage: r.usage ?? null,
        usageStatus: status,
        durationMs: typeof r.durationMs === 'number' && Number.isFinite(r.durationMs) ? r.durationMs : null,
        model: typeof r.model === 'string' ? r.model : null,
      };
    }
    case 'stream_error':
      if (!isNonEmptyString(r.errorCode)) return null;
      return {
        ...base,
        type: 'stream_error',
        errorCode: r.errorCode,
        message: typeof r.message === 'string' ? r.message : 'AI sedang tidak tersedia.',
        retryable: r.retryable === true,
      };
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Parser SSE inkremental
// ---------------------------------------------------------------------------

export interface SseParserCallbacks {
  onEvent: (event: StreamEvent) => void;
  /** Dipanggil untuk setiap blok yang rusak (bukan JSON / gagal validasi).
   *  Parser TIDAK PERNAH melempar — event malformed dilewati, stream jalan. */
  onMalformed?: (detail: string) => void;
}

export interface SseParser {
  /** Umpan potongan teks hasil TextDecoder (sudah decode UTF-8 streaming). */
  feed(chunk: string): void;
  /** Akhiri stream: proses sisa buffer sebagai blok terakhir bila ada. */
  finish(): void;
}

/**
 * Parser SSE inkremental (spec server-sent-events, subset yang dipakai
 * gateway): event dipisah baris kosong; baris `event:` memberi tipe,
 * baris `data:` (boleh banyak, digabung '\n') memberi payload JSON;
 * baris `:` adalah komentar (heartbeat) dan diabaikan; payload `[DONE]`
 * ditoleransi (diabaikan — protokol kita tidak memakainya).
 *
 * Batas chunk arbitrer: satu event boleh terbelah di tengah baris mana
 * pun; buffer menahan baris tak lengkap sampai feed berikutnya.
 */
export function createSseParser(callbacks: SseParserCallbacks): SseParser {
  let buffer = '';

  const dispatchBlock = (block: string): void => {
    let eventType: string | null = null;
    const dataLines: string[] = [];
    for (const rawLine of block.split('\n')) {
      const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
      if (!line) continue;
      if (line.startsWith(':')) continue; // komentar / heartbeat
      if (line.startsWith('event:')) {
        eventType = line.slice('event:'.length).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice('data:'.length).replace(/^ /, ''));
      }
      // Baris lain (id:, retry:, dsb.) diabaikan — bukan bagian kontrak.
    }
    if (dataLines.length === 0) return;
    const payload = dataLines.join('\n');
    if (payload === '[DONE]') return;
    if (!eventType) {
      callbacks.onMalformed?.('blok SSE tanpa baris event:');
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      callbacks.onMalformed?.(`data SSE bukan JSON valid (event ${eventType})`);
      return;
    }
    // Tipe event dari baris `event:` adalah otoritas — payload JSON tidak
    // membawa `type` sendiri (writer server menaruh tipe di baris event).
    const withType =
      parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? { ...(parsed as Record<string, unknown>), type: eventType }
        : parsed;
    const event = validateStreamEvent(withType);
    if (!event) {
      callbacks.onMalformed?.(`event ${eventType} gagal validasi`);
      return;
    }
    callbacks.onEvent(event);
  };

  return {
    feed(chunk: string): void {
      if (!chunk) return;
      buffer += chunk;
      let idx: number;
      // Pemisah event = baris kosong: '\n\n' (setelah normalisasi \r\n
      // di bawah, '\r\n\r\n' juga menjadi '\n\n').
      buffer = buffer.replace(/\r\n/g, '\n');
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        dispatchBlock(block);
      }
    },
    finish(): void {
      const rest = buffer.trim();
      buffer = '';
      if (rest) dispatchBlock(rest);
    },
  };
}

// ---------------------------------------------------------------------------
// Staging konten per leg (perakitan client-side)
// ---------------------------------------------------------------------------

export interface LegStaging {
  /** Tambah delta ke staging leg. Delta untuk leg yang sudah complete
   *  diabaikan (pelanggaran protokol — jangan ubah konten final). */
  applyDelta(leg: number, delta: string): void;
  /** Hapus staging leg (setelah leg_failed) — konten provisional leg
   *  gagal TIDAK BOLEH tersambung dengan leg berikutnya. */
  resetLeg(leg: number): void;
  /** Tandai leg lengkap; snapshot kontennya sebagai konten final.
   *  Complete kedua (protokol: hanya satu leg yang complete) diabaikan. */
  completeLeg(leg: number): string;
  getLegContent(leg: number): string;
  /** Leg yang menyelesaikan stream (null bila belum ada). */
  readonly completedLeg: number | null;
  /** Konten final (null bila belum ada leg yang complete). */
  readonly completedContent: string | null;
}

/**
 * Perakit konten ber-skala leg. Pure + tanpa efek samping — satu-satunya
 * tempat aturan "reset menghapus provisional" hidup di klien.
 */
export function createLegStaging(): LegStaging {
  const staging = new Map<number, string>();
  let completed: { leg: number; content: string } | null = null;

  return {
    applyDelta(leg: number, delta: string): void {
      if (completed && completed.leg === leg) return;
      if (!delta) return;
      staging.set(leg, (staging.get(leg) || '') + delta);
    },
    resetLeg(leg: number): void {
      staging.delete(leg);
    },
    completeLeg(leg: number): string {
      if (completed) return completed.content;
      const content = staging.get(leg) || '';
      completed = { leg, content };
      return content;
    },
    getLegContent(leg: number): string {
      return staging.get(leg) || '';
    },
    get completedLeg(): number | null {
      return completed ? completed.leg : null;
    },
    get completedContent(): string | null {
      return completed ? completed.content : null;
    },
  };
}

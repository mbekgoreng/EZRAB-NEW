/**
 * api/_lib/streamEvents.js — Server-Sent Events (SSE) writer + definisi
 * event untuk streaming respons AI real-time (Fase 1, 2026-11-20).
 *
 * Kontrak event kanonis (disepakati dengan klien di
 * src/ai-tools/ezrab-ai/streamEvents.ts — definisi ganda, dipin satu tes
 * kesepakatan di src/test/aiStreamingTransport.test.ts, mengikuti pola
 * kembar accessGate.js <-> middleware.ts):
 *
 *   message_start    { messageId, conversationId, requestId }
 *   leg_start        { messageId, leg }
 *   content_delta    { messageId, leg, delta }
 *   leg_failed       { messageId, leg, errorCode }
 *   content_reset    { messageId, leg }
 *   stage            { messageId, stage }
 *   content_complete { messageId, leg }
 *   message_complete { messageId, requestId, usage, usageStatus, durationMs, model }
 *   stream_error     { messageId, errorCode, message, retryable }
 *
 * MASKING: tidak ada nama provider/model ASLI di event mana pun.
 * `model` di message_complete adalah alias tampil per mode
 * (modelMasking.js); `leg` adalah indeks urutan leg (0, 1, 2, ...),
 * bukan identitas provider. `errorCode` di leg_failed memakai klasifikasi
 * errorClass gateway yang sudah disanitasi (timeout/network/server/rate/
 * auth/empty/bad_response/aborted/policy/client_error) — bukan teks error
 * mentah provider.
 *
 * File ini di bawah api/_lib/ — BUKAN endpoint (tidak menambah kuota
 * fungsi Vercel 12/12; apiEndpointInventory menghitung handler di luar
 * _lib saja).
 */

/** Daftar kanonis tipe event SSE server -> klien (urutan = urutan alur normal). */
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
];

/** Interval heartbeat SSE (komentar `: ping`) saat stream idle. 15 detik:
 *  di dalam rentang 15-20 dtk rekomendasi Fase 0; cukup sering untuk
 *  proxy dengan batas idle 30 dtk, cukup jarang untuk tidak membebani.
 *  R1 TERJAWAB (cek dashboard 2026-11-20 00:19): maxDuration efektif
 *  300 dtk DIHORMATI di paket Hobby — heartbeat di sini untuk koneksi
 *  idle, BUKAN untuk mengantisipasi pemotongan paksa di 60 dtk. */
export const STREAM_HEARTBEAT_MS = 15000;

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
  // Minta proxy/CDN untuk tidak menahan (buffer) chunk SSE. Vercel
  // menghormati streaming response Node; header ini no-op yang aman di
  // proxy yang tidak mengenalnya. Perilaku SSE lewat Vercel tetap
  // NOT RUN sampai deployment uji Fase 5 (R8).
  'X-Accel-Buffering': 'no',
};

/**
 * Format satu frame SSE: `event: <type>\ndata: <JSON satu baris>\n\n`.
 * Pure + exported untuk tes kesepakatan dengan parser klien.
 * Melempar pada tipe tak dikenal atau data bukan objek — gagal-cepat di
 * server lebih baik daripada mengirim frame rusak ke klien.
 */
export function formatSseEvent(type, data) {
  if (!STREAM_EVENT_TYPES.includes(type)) {
    throw new Error('streamEvents: tipe event SSE tak dikenal: ' + String(type));
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('streamEvents: data event SSE harus objek untuk tipe ' + type);
  }
  return 'event: ' + type + '\ndata: ' + JSON.stringify(data) + '\n\n';
}

/**
 * Writer SSE di atas objek respons ala Node (ServerResponse Vercel).
 * Header di-flush LAZY pada event pertama — pemanggil (handleAiRequest)
 * membuat writer di dalam callback execute() adapter metering, SEBELUM
 * headers terkirim, sehingga penolakan pra-eksekusi (metering fail-closed)
 * masih bisa menjawab JSON error biasa. Sesudah header SSE terkirim,
 * semua hasil (termasuk error) disampaikan sebagai event + res.end().
 *
 * - sendEvent(type, data): tulis satu frame; false bila stream sudah
 *   berakhir atau tulis gagal (socket mati — pemanggil menghentikan
 *   rantai lewat sinyal disconnect, bukan lewat nilai ini).
 * - heartbeat(): tulis komentar `: ping`; no-op sebelum header ter-flush
 *   (heartbeat tidak boleh mem-flush header sendirian) atau sesudah end.
 * - end(): tutup stream (res.end); aman dipanggil berulang.
 *
 * Listener 'error' no-op dipasang pada res selama stream hidup: tulis ke
 * socket yang sudah mati bisa memicu event 'error' asinkron pada
 * ServerResponse, dan EventEmitter tanpa listener 'error' akan melempar
 * — fungsi serverless tidak boleh crash karena klien pergi. Listener
 * dilepas di end().
 */
export function createSseWriter(res) {
  let flushed = false;
  let ended = false;
  let writeFailed = false;

  const onResError = () => {
    // Socket mati di tengah stream — rantai dihentikan lewat sinyal
    // disconnect (handleAiRequest); di sini cukup menelan error agar
    // fungsi tidak crash. Tanpa listener ini, EventEmitter melempar.
    writeFailed = true;
  };
  if (res && typeof res.on === 'function') {
    try {
      res.on('error', onResError);
    } catch {
      /* mock res tanpa EventEmitter penuh — abaikan */
    }
  }

  const flushHeaders = () => {
    if (flushed) return;
    flushed = true;
    try {
      if (typeof res.writeHead === 'function') {
        res.writeHead(200, SSE_HEADERS);
      } else if (typeof res.setHeader === 'function') {
        // Mock res tanpa writeHead (tes): set header satu per satu.
        for (const [k, v] of Object.entries(SSE_HEADERS)) res.setHeader(k, v);
      }
      if (typeof res.flush === 'function') res.flush();
    } catch {
      writeFailed = true;
    }
  };

  const writeFrame = (frame) => {
    if (ended || writeFailed) return false;
    try {
      if (typeof res.write !== 'function') return false;
      res.write(frame);
      if (typeof res.flush === 'function') res.flush();
      return true;
    } catch {
      writeFailed = true;
      return false;
    }
  };

  return {
    get flushed() {
      return flushed;
    },
    get ended() {
      return ended;
    },
    get writeFailed() {
      return writeFailed;
    },
    sendEvent(type, data) {
      if (ended || writeFailed) return false;
      // formatSseEvent melempar pada tipe/data tak valid — sengaja TIDAK
      // ditangkap: bug server harus terlihat di log, bukan disembunyikan
      // menjadi stream yang diam-diam berhenti.
      const frame = formatSseEvent(type, data);
      flushHeaders();
      return writeFrame(frame);
    },
    heartbeat() {
      if (ended || writeFailed || !flushed) return false;
      return writeFrame(': ping\n\n');
    },
    end() {
      if (ended) return;
      ended = true;
      try {
        if (typeof res.removeListener === 'function') res.removeListener('error', onResError);
        else if (typeof res.off === 'function') res.off('error', onResError);
      } catch {
        /* abaikan */
      }
      try {
        if (typeof res.end === 'function') res.end();
      } catch {
        /* socket sudah mati — tidak ada yang perlu ditutup */
      }
    },
  };
}

/**
 * constructionFeedback — penangkapan feedback TERSTRUKTUR & LOKAL untuk
 * sistem belajar TERKENDALI EZRAB.
 *
 * Batas yang disengaja (dinyatakan terbuka): modul ini menangkap &
 * mengklasifikasi peristiwa (koreksi pengguna, kegagalan klasifikasi,
 * pengetahuan hilang, kegagalan tool, permintaan tak didukung,
 * ekstraksi salah) sebagai data terstruktur di memori proses + sink
 * yang dapat disuntikkan pemanggil (mis. tes / penyimpanan lokal
 * aplikasi). Modul ini TIDAK menulis ke data produksi, TIDAK mengubah
 * knowledge base, dan TIDAK melakukan pembelajaran otomatis.
 *
 * Pipeline review (dokumen pendamping di
 * docs/ai-audit/CONSTRUCTION_INTELLIGENCE_ARCHITECTURE.md):
 * captured → dedup → validation → expert approval → knowledge update →
 * regression test → release. Status pipeline pada tiap peristiwa hanya
 * bergerak oleh keputusan reviewer manusia di luar modul ini.
 */

export type FeedbackKind =
  | 'user-correction'
  | 'classification-failure'
  | 'missing-knowledge'
  | 'tool-failure'
  | 'unsupported-request'
  | 'extraction-error';

export type FeedbackPipelineStage =
  | 'captured' | 'deduped' | 'validated' | 'expert-approved' | 'knowledge-updated' | 'regression-tested' | 'released';

export interface ConstructionFeedbackEvent {
  id: string;
  kind: FeedbackKind;
  /** Teks/konteks pemicu (pesan pengguna atau nama tool). */
  subject: string;
  /** Nilai yang salah/diharapkan, terstruktur bila diketahui. */
  detail: Record<string, unknown>;
  stage: FeedbackPipelineStage;
  /** Kunci dedup deterministik: kind + subjek ternormalisasi. */
  dedupeKey: string;
  capturedAt: string;
  occurrences: number;
}

export type FeedbackSink = (event: ConstructionFeedbackEvent) => void;

const store = new Map<string, ConstructionFeedbackEvent>();
let counter = 0;
let sink: FeedbackSink | null = null;

/** Pasang sink eksternal (opsional — mis. penyimpanan lokal aplikasi). */
export function setFeedbackSink(next: FeedbackSink | null): void {
  sink = next;
}

function dedupeKeyFor(kind: FeedbackKind, subject: string): string {
  return `${kind}::${subject.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 160)}`;
}

/**
 * Tangkap satu peristiwa feedback. Peristiwa dengan kind + subjek yang
 * sama digabung (dedup): occurrences bertambah, entri tidak berlipat.
 */
export function captureFeedback(
  kind: FeedbackKind,
  subject: string,
  detail: Record<string, unknown> = {}
): ConstructionFeedbackEvent {
  const key = dedupeKeyFor(kind, subject);
  const existing = store.get(key);
  if (existing) {
    existing.occurrences += 1;
    existing.detail = { ...existing.detail, ...detail };
    if (sink) sink(existing);
    return existing;
  }
  const event: ConstructionFeedbackEvent = {
    id: `fb-${Date.now()}-${++counter}`,
    kind,
    subject,
    detail,
    stage: 'captured',
    dedupeKey: key,
    capturedAt: new Date().toISOString(),
    occurrences: 1,
  };
  store.set(key, event);
  if (sink) sink(event);
  return event;
}

/** Semua peristiwa tertangkap (urut tangkapan). */
export function listFeedback(): ConstructionFeedbackEvent[] {
  return [...store.values()];
}

/** Ringkasan per jenis — bahan antrean review manusia. */
export function feedbackSummary(): Record<FeedbackKind, number> {
  const out: Record<FeedbackKind, number> = {
    'user-correction': 0, 'classification-failure': 0, 'missing-knowledge': 0,
    'tool-failure': 0, 'unsupported-request': 0, 'extraction-error': 0,
  };
  for (const e of store.values()) out[e.kind] += e.occurrences;
  return out;
}

/* ------------------------------------------------------------------ */
/* Transisi pipeline review (finalisasi 2026-11-08, §10).              */
/*                                                                     */
/* Status pipeline pada brief owner: CAPTURED → DEDUPLICATED →         */
/* VALIDATED → EXPERT REVIEW (expert-approved) → KNOWLEDGE UPDATE →    */
/* REGRESSION TEST → RELEASE. Pemetaan ke stage modul ini:             */
/* 'captured' = CAPTURED · 'deduped' = DEDUPLICATED · 'validated' =    */
/* VALIDATED · 'expert-approved' = lolos EXPERT REVIEW ·               */
/* 'knowledge-updated' = KNOWLEDGE UPDATE · 'regression-tested' =      */
/* REGRESSION TEST · 'released' = RELEASE.                             */
/*                                                                     */
/* Transisi HANYA boleh maju satu tahap berurutan dan HANYA lewat      */
/* fungsi ini dengan catatan reviewer manusia (reviewer + note wajib). */
/* Modul ini TIDAK PERNAH memajukan stage sendiri: captureFeedback      */
/* selalu berhenti di 'captured', dan tidak ada jalur otomatis dari    */
/* feedback mentah ke knowledge base.                                  */
/* ------------------------------------------------------------------ */

export const FEEDBACK_STAGE_ORDER: FeedbackPipelineStage[] = [
  'captured', 'deduped', 'validated', 'expert-approved', 'knowledge-updated', 'regression-tested', 'released',
];

/** Maju satu tahap pipeline oleh reviewer manusia. Melempar bila transisi tidak sah. */
export function advanceFeedbackStage(
  eventId: string,
  reviewer: string,
  note: string
): ConstructionFeedbackEvent {
  if (!reviewer?.trim() || !note?.trim()) {
    throw new Error('advanceFeedbackStage: reviewer dan note wajib diisi (keputusan manusia, bukan otomatis)');
  }
  const ev = [...store.values()].find((e) => e.id === eventId);
  if (!ev) throw new Error(`advanceFeedbackStage: event ${eventId} tidak ditemukan`);
  const idx = FEEDBACK_STAGE_ORDER.indexOf(ev.stage);
  if (idx < 0 || idx >= FEEDBACK_STAGE_ORDER.length - 1) {
    throw new Error(`advanceFeedbackStage: stage "${ev.stage}" adalah tahap akhir — tidak dapat dimajukan`);
  }
  ev.stage = FEEDBACK_STAGE_ORDER[idx + 1];
  ev.detail = { ...ev.detail, [`review:${ev.stage}`]: { reviewer, note, at: new Date().toISOString() } };
  if (sink) sink(ev);
  return ev;
}

/** Kosongkan store (dipakai tes; runtime tidak memanggil ini otomatis). */
export function clearFeedback(): void {
  store.clear();
}

/* ------------------------------------------------------------------ */
/* Persistensi LOKAL perangkat — MVP-1 proposal persistensi feedback  */
/* (FINISH MODE Workstream D).                                         */
/*                                                                     */
/* Keputusan proposal yang BELUM terjawab owner (opt-in pengguna       */
/* default-MATI lewat saklar Pengaturan, teks persetujuan resmi,       */
/* peran reviewer, retensi) TIDAK diambil di sini: modul ini TIDAK     */
/* memasang saklar, TIDAK mengaktifkan persistensi apa pun secara      */
/* default, dan TIDAK menuliskannya ke jalur produksi. Yang dibangun   */
/* hanya LAPISAN PENYIMPANAN lokal yang tidak bergantung keputusan     */
/* itu — pola storageGet/storageSet yang sama dengan aplikasi          */
/* (localStorage bila ada; fallback memori untuk tes/node, mengikuti   */
/* companyProfile.ts document-ai) — yang dapat dipasang pemanggil      */
/* sebagai sink lewat setFeedbackSink() SESUDAH persetujuan ada.       */
/*                                                                     */
/* Sifat data (pemisahan tegas proposal §1): yang disimpan di sini     */
/* adalah SALINAN PERISTIWA SESI di perangkat yang sama (bukan data     */
/* belajar persisten, bukan transmisi server — backend belum ada).     */
/* Sink ini tidak pernah memajukan stage dan tidak pernah menulis KB.  */
/* ------------------------------------------------------------------ */

export const FEEDBACK_LOCAL_STORAGE_KEY = 'ezrab_ai_feedback_local_v1';
/** Batas peristiwa tersimpan lokal (yang terlama dibuang lebih dulu). */
export const FEEDBACK_LOCAL_MAX_EVENTS = 200;

const feedbackMemoryStore = new Map<string, string>();
function feedbackStorageGet(key: string): string | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage.getItem(key);
  } catch { /* abaikan — fallback memori */ }
  return feedbackMemoryStore.get(key) ?? null;
}
function feedbackStorageSet(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
      return;
    }
  } catch { /* abaikan — fallback memori */ }
  feedbackMemoryStore.set(key, value);
}
function feedbackStorageRemove(key: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
  } catch { /* abaikan */ }
  feedbackMemoryStore.delete(key);
}

/** Baca peristiwa feedback yang tersimpan lokal (array kosong bila belum ada/rusak). */
export function readLocalFeedbackEvents(): ConstructionFeedbackEvent[] {
  const raw = feedbackStorageGet(FEEDBACK_LOCAL_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is ConstructionFeedbackEvent =>
        !!e && typeof e === 'object' && typeof (e as ConstructionFeedbackEvent).id === 'string' &&
        typeof (e as ConstructionFeedbackEvent).dedupeKey === 'string'
    );
  } catch {
    return [];
  }
}

/**
 * Sink persistensi lokal: setiap peristiwa yang ditangkap ditulis (upsert
 * per dedupeKey, tahap apa adanya) ke penyimpanan lokal perangkat.
 * Idempoten terhadap tangkapan ulang peristiwa yang sama. TIDAK dipasang
 * secara default — pemanggil (UI persetujuan owner) yang memasangnya
 * lewat setFeedbackSink(createLocalFeedbackSink()).
 */
export function createLocalFeedbackSink(): FeedbackSink {
  return (event) => {
    const events = readLocalFeedbackEvents();
    const idx = events.findIndex((e) => e.dedupeKey === event.dedupeKey);
    if (idx >= 0) events[idx] = { ...event };
    else events.push({ ...event });
    const trimmed = events.slice(-FEEDBACK_LOCAL_MAX_EVENTS);
    try {
      feedbackStorageSet(FEEDBACK_LOCAL_STORAGE_KEY, JSON.stringify(trimmed));
    } catch { /* penyimpanan penuh/rusak tidak boleh menjatuhkan jalur feedback */ }
  };
}

/** Hapus seluruh feedback tersimpan lokal (hak hapus pengguna, proposal §1 butir 7). */
export function clearLocalFeedbackEvents(): void {
  feedbackStorageRemove(FEEDBACK_LOCAL_STORAGE_KEY);
}

/**
 * DED progress dibedakan per mode (mockup "DED progress 2 mode",
 * ACC owner 2026-11-20 23:28).
 * Run: npx vitest run src/test/dedProgressTwoModes.test.ts
 *
 * Mencakup:
 *  1. getStageDefs: EZRAB_AI = 6 tahap (urutan + kunci lama utuh),
 *     default (tanpa mode) = 6 tahap EZRAB_AI, FULL_AI = 3 tahap ringkas.
 *  2. Teks kamus ID persis (mockup yang di-ACC) untuk 3 tahap Full AI,
 *     dan 6 tahap EZRAB_AI TIDAK BERUBAH.
 *  3. mapProgressStageKey: pemetaan kunci 6-tahap → 3-tahap Full AI.
 *  4. applyStageMark: penanda status pada daftar 3 tahap (tidak crash,
 *     propagasi done/active/failed benar) + simulasi urutan lari Full AI.
 */
import { describe, it, expect } from 'vitest';
import {
  getStageDefs,
  mapProgressStageKey,
  applyStageMark,
  type DedAiStage,
} from '../ai-tools/ded-ai-estimate/DedAiProgressView';
import { id as idDict } from '../i18n/dictionaries';

/** Resolver kamus nyata (jalan kunci bertitik seperti `t` di I18nContext). */
const resolveId = (key: string): string => {
  let cur: unknown = idDict;
  for (const part of key.split('.')) {
    cur = (cur as Record<string, unknown>)[part];
  }
  if (typeof cur !== 'string') throw new Error(`kunci kamus hilang: ${key}`);
  return cur;
};

/** `t` stub: mengembalikan kunci apa adanya (untuk uji struktur). */
const keyT = (key: string) => key;

const waitingStages = (keys: string[]): DedAiStage[] =>
  keys.map((key) => ({ key, title: key, desc: '', icon: null, status: 'waiting' as const }));

describe('getStageDefs — diferensiasi per mode', () => {
  it('EZRAB_AI mengembalikan 6 tahap dengan urutan + kunci lama', () => {
    const defs = getStageDefs(keyT, 'EZRAB_AI');
    expect(defs.map((d) => d.key)).toEqual([
      'received', 'reading', 'extract', 'identify', 'validate', 'prepare',
    ]);
  });

  it('tanpa argumen mode default tetap 6 tahap EZRAB_AI', () => {
    const defs = getStageDefs(keyT);
    expect(defs).toHaveLength(6);
    expect(defs.map((d) => d.key)).toEqual(
      getStageDefs(keyT, 'EZRAB_AI').map((d) => d.key),
    );
  });

  it('FULL_AI mengembalikan tepat 3 tahap ringkas', () => {
    const defs = getStageDefs(keyT, 'FULL_AI');
    expect(defs.map((d) => d.key)).toEqual(['received', 'scan', 'compose']);
  });

  it('semua definisi kedua mode membawa ikon', () => {
    for (const mode of ['EZRAB_AI', 'FULL_AI'] as const) {
      for (const d of getStageDefs(keyT, mode)) {
        expect(d.icon).toBeDefined();
        expect(d.icon).not.toBeNull();
      }
    }
  });
});

describe('teks kamus ID — 3 tahap Full AI persis mockup ACC', () => {
  it('judul + deskripsi 3 tahap Full AI sama persis dengan mockup', () => {
    const defs = getStageDefs(resolveId, 'FULL_AI');
    expect(defs[0].title).toBe('Dokumen diterima');
    expect(defs[0].desc).toBe('File tervalidasi dan siap diproses.');
    expect(defs[1].title).toBe('Scan dokumen');
    expect(defs[1].desc).toBe('Full AI memindai dan membaca seluruh halaman dokumen.');
    expect(defs[2].title).toBe('AI menyusun estimasi');
    expect(defs[2].desc).toBe('Full AI menganalisis, menghitung, dan menyusun RAB sampai selesai.');
  });

  it('kalimat penjelas per mode tersedia di kamus', () => {
    expect(resolveId('ai.ded.progress.mode_note_ezrab')).toBe(
      'Memakai database EZRAB: harga AHSP kanonis + validasi kuantitas dan satuan di kode.',
    );
    expect(resolveId('ai.ded.progress.mode_note_full')).toBe(
      'AI mengerjakan semuanya dari hasil scan — tanpa tahap validasi database terpisah.',
    );
  });
});

describe('teks kamus ID — 6 tahap EZRAB_AI tidak berubah', () => {
  it('judul + deskripsi keenam tahap sama seperti sebelum diferensiasi', () => {
    const defs = getStageDefs(resolveId, 'EZRAB_AI');
    expect(defs.map((d) => d.title)).toEqual([
      'Dokumen diterima',
      'Membaca dokumen dan gambar',
      'Mengekstrak informasi proyek',
      'Mengidentifikasi pekerjaan dan kuantitas',
      'Memvalidasi hasil',
      'Menyiapkan estimasi',
    ]);
    expect(defs.map((d) => d.desc)).toEqual([
      'File tervalidasi dan siap diproses.',
      'Mengekstrak teks dari setiap halaman PDF.',
      'Menyiapkan ringkasan halaman untuk AI.',
      'AI menganalisis dan menyusun daftar pekerjaan.',
      'Cek kuantitas, satuan, dan kewajaran harga di kode.',
      'Menghitung subtotal dan total secara deterministik.',
    ]);
  });
});

describe('mapProgressStageKey', () => {
  it('FULL_AI: baca + ekstrak → scan; identifikasi + validasi + siapkan → compose', () => {
    expect(mapProgressStageKey('received', 'FULL_AI')).toBe('received');
    expect(mapProgressStageKey('reading', 'FULL_AI')).toBe('scan');
    expect(mapProgressStageKey('extract', 'FULL_AI')).toBe('scan');
    expect(mapProgressStageKey('identify', 'FULL_AI')).toBe('compose');
    expect(mapProgressStageKey('validate', 'FULL_AI')).toBe('compose');
    expect(mapProgressStageKey('prepare', 'FULL_AI')).toBe('compose');
  });

  it('EZRAB_AI: pemetaan identitas', () => {
    for (const key of ['received', 'reading', 'extract', 'identify', 'validate', 'prepare']) {
      expect(mapProgressStageKey(key, 'EZRAB_AI')).toBe(key);
    }
  });

  it('kunci tak dikenal diteruskan apa adanya di kedua mode', () => {
    expect(mapProgressStageKey('bogus', 'FULL_AI')).toBe('bogus');
    expect(mapProgressStageKey('bogus', 'EZRAB_AI')).toBe('bogus');
  });
});

describe('applyStageMark pada daftar 3 tahap (Full AI)', () => {
  const ORDER_3 = ['received', 'scan', 'compose'];

  it('menandai scan aktif: received selesai, compose menunggu', () => {
    const out = applyStageMark(waitingStages(ORDER_3), ORDER_3, 'scan', 'active');
    expect(out.map((s) => s.status)).toEqual(['done', 'active', 'waiting']);
  });

  it('hanya tahap waiting yang dipromosikan menjadi done (semantik lama dipertahankan)', () => {
    // Tahap 'active' TIDAK otomatis menjadi done saat tahap sesudahnya
    // ditandai — dalam lari nyata scan selalu ditandai done secara
    // eksplisit sebelum compose aktif (lihat tes simulasi di bawah).
    const mid = applyStageMark(waitingStages(ORDER_3), ORDER_3, 'scan', 'active');
    const out = applyStageMark(mid, ORDER_3, 'compose', 'done');
    expect(out.map((s) => s.status)).toEqual(['done', 'active', 'done']);
  });

  it('menandai scan gagal: tidak crash, received selesai, compose menunggu', () => {
    const out = applyStageMark(waitingStages(ORDER_3), ORDER_3, 'scan', 'failed');
    expect(out.map((s) => s.status)).toEqual(['done', 'failed', 'waiting']);
  });

  it('kunci tak dikenal: tidak crash, daftar tidak berubah', () => {
    const stages = waitingStages(ORDER_3);
    const out = applyStageMark(stages, ORDER_3, 'bogus', 'active');
    expect(out.map((s) => s.status)).toEqual(['waiting', 'waiting', 'waiting']);
  });

  it('simulasi urutan lari Full AI: received done → scan aktif → scan done → compose aktif → compose done', () => {
    let stages = waitingStages(ORDER_3);
    // Urutan markUpTo yang sama seperti runFullAiAnalysis (sesudah pemetaan kunci).
    stages = applyStageMark(stages, ORDER_3, mapProgressStageKey('received', 'FULL_AI'), 'done');
    expect(stages.map((s) => s.status)).toEqual(['done', 'waiting', 'waiting']);
    stages = applyStageMark(stages, ORDER_3, mapProgressStageKey('reading', 'FULL_AI'), 'active');
    expect(stages.map((s) => s.status)).toEqual(['done', 'active', 'waiting']);
    stages = applyStageMark(stages, ORDER_3, mapProgressStageKey('extract', 'FULL_AI'), 'done');
    expect(stages.map((s) => s.status)).toEqual(['done', 'done', 'waiting']);
    stages = applyStageMark(stages, ORDER_3, mapProgressStageKey('identify', 'FULL_AI'), 'active');
    expect(stages.map((s) => s.status)).toEqual(['done', 'done', 'active']);
    // Callback VALIDATE/FINALIZE: compose done lalu aktif lagi — net: aktif.
    stages = applyStageMark(stages, ORDER_3, mapProgressStageKey('validate', 'FULL_AI'), 'active');
    expect(stages.map((s) => s.status)).toEqual(['done', 'done', 'active']);
    stages = applyStageMark(stages, ORDER_3, mapProgressStageKey('prepare', 'FULL_AI'), 'done');
    expect(stages.map((s) => s.status)).toEqual(['done', 'done', 'done']);
  });

  it('urutan lari Full AI yang gagal di compose: compose failed, dua tahap awal selesai', () => {
    let stages = waitingStages(ORDER_3);
    stages = applyStageMark(stages, ORDER_3, 'received', 'done');
    stages = applyStageMark(stages, ORDER_3, 'scan', 'done');
    stages = applyStageMark(stages, ORDER_3, mapProgressStageKey('identify', 'FULL_AI'), 'failed');
    expect(stages.map((s) => s.status)).toEqual(['done', 'done', 'failed']);
  });
});

describe('applyStageMark pada daftar 6 tahap (EZRAB_AI — perilaku lama)', () => {
  const ORDER_6 = ['received', 'reading', 'extract', 'identify', 'validate', 'prepare'];

  it('menandai reading aktif: received selesai, sisanya menunggu', () => {
    const out = applyStageMark(waitingStages(ORDER_6), ORDER_6, 'reading', 'active');
    expect(out.map((s) => s.status)).toEqual([
      'done', 'active', 'waiting', 'waiting', 'waiting', 'waiting',
    ]);
  });

  it('tahap yang sudah failed/done tidak ditimpa menjadi done oleh markUpTo berikutnya', () => {
    let stages = waitingStages(ORDER_6);
    stages = applyStageMark(stages, ORDER_6, 'reading', 'failed');
    stages = applyStageMark(stages, ORDER_6, 'identify', 'active');
    expect(stages.map((s) => s.status)).toEqual([
      'done', 'failed', 'done', 'active', 'waiting', 'waiting',
    ]);
  });
});

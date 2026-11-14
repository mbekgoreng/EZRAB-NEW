/**
 * P4-guard (CD-7, Audit Fase 0 Autonomous Estimation 2026-11-13) —
 * guard kesiapan di `activateRevision`: tolak aktivasi revisi yang
 * kandidatnya BLOCKED, memakai `draftReadiness` yang SAMA dengan guard
 * transfer (bukan logika kesiapan baru). Bar yang sama dengan transfer:
 * hanya BLOCKED yang ditolak; NEEDS_SPEC tetap boleh diaktifkan.
 *
 * Yang diuji di sini (tanpa render React — handler view.tsx adalah
 * closure React, seperti pola G1):
 *  (a) aktivasi revisi BLOCKED DITOLAK dengan kode DRAFT_NOT_READY,
 *      revisi aktif + storage tidak berubah (jalur alami pondasi +
 *      jalur mutasi parameter-hilang + volume-INVALID);
 *  (b) aktivasi revisi siap tetap berhasil (NEEDS_SPEC kanonis +
 *      READY penuh sintetis);
 *  (c) aktivasi idempotent (kunci sama → alreadyActivated, tanpa
 *      duplikasi, tanpa tulis kedua);
 *  (d) versi lama byte-identik sesudah aktivasi versi baru;
 *  (e) gagal aktivasi (guard konkurensi stale) tidak merusak revisi
 *      aktif;
 *  (f) penolakan kesiapan tidak mengonsumsi kunci idempotensi —
 *      kandidat yang sama sesudah diperbaiki dapat diaktifkan;
 *  (g) kontrak-sumber: guard berada di DALAM activateRevision dan
 *      memakai ulang draftReadiness (tanpa logika kesiapan baru).
 *
 * Run: runner shim vitest (lihat shim-p4/run-targeted-p4.sh).
 * Provider nyata: NOT RUN (0 panggilan).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import {
  buildUniversalDraft,
  draftReadiness,
  effectiveItems,
  setLastUniversalDraft,
  type UniversalDraft,
} from '../ai-tools/ezrab-ai/universalRab';
import {
  peekPersistedDraft,
  saveDraft,
} from '../ai-tools/ezrab-ai/draftPersistence';
import {
  activateRevision,
  buildRevisionPreview,
  type RevisionPreview,
} from '../ai-tools/ezrab-ai/draftRevision';

/* ---------------- localStorage shim (dengan penghitung tulis) ------- */
/* Pola sama seperti suite G1 / draftPersistenceHardening. */
const store: Record<string, string> = {};
const writeCounts: Record<string, number> = {};
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => {
    writeCounts[k] = (writeCounts[k] ?? 0) + 1;
    store[k] = v;
  },
  removeItem: (k: string) => { delete store[k]; },
  clear: () => { for (const k of Object.keys(store)) delete store[k]; },
};

const MULTI_TEXT =
  'buatkan RAB Gedung A 3 lantai 15 x 10 m + Gedung B 2 lantai 12 x 8 m, plus jalan akses sepanjang 50 m';
const PONDASI_TEXT = 'buatkan RAB pondasi rumah 100 m2';

/** Stringify kanonis (kunci terurut, sesudah round-trip JSON) — pola 5C. */
const canon = (v: unknown): string => {
  const roundTripped = JSON.parse(JSON.stringify(v)) as unknown;
  const walk = (x: unknown): string => {
    if (x === null || typeof x !== 'object') return JSON.stringify(x) ?? 'null';
    if (Array.isArray(x)) return `[${x.map(walk).join(',')}]`;
    const o = x as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${walk(o[k])}`)
      .join(',')}}`;
  };
  return walk(roundTripped);
};

let pidCounter = 0;
const nextPid = () => `PRJ-P4-${++pidCounter}`;

function draftOf(text: string): UniversalDraft {
  const res = buildUniversalDraft(text);
  expect(res.kind).toBe('draft');
  if (res.kind !== 'draft') throw new Error(`buildUniversalDraft kind=${res.kind}`);
  return res.draft;
}

/** Draft yang SUDAH tersimpan (syarat aktivasi). */
function buildSaved(text: string): { pid: string; draft: UniversalDraft } {
  const pid = nextPid();
  const draft = draftOf(text);
  setLastUniversalDraft(draft, pid);
  const saved = saveDraft({ draft, projectId: pid });
  expect(saved.ok).toBe(true);
  return { pid, draft };
}

function previewOf(draft: UniversalDraft, pid: string, text: string): RevisionPreview {
  const out = buildRevisionPreview(draft, text, pid);
  expect(out.kind).toBe('preview');
  if (out.kind !== 'preview') throw new Error(`buildRevisionPreview kind=${out.kind}`);
  return out.preview;
}

function totalWrites(): number {
  return Object.values(writeCounts).reduce((s, n) => s + n, 0);
}

function storageSnapshot(): string {
  return JSON.stringify(Object.entries(store).sort((a, b) => a[0].localeCompare(b[0])));
}

beforeEach(() => {
  localStorage.clear();
  for (const k of Object.keys(writeCounts)) delete writeCounts[k];
  setLastUniversalDraft(null);
});

/* ================================================================== */
/* (a) Aktivasi revisi BLOCKED DITOLAK                                 */
/* ================================================================== */

describe('P4 — aktivasi revisi BLOCKED ditolak (DRAFT_NOT_READY)', () => {
  it('jalur alami: revisi draft pondasi tanpa tipe pondasi → ditolak, aktif utuh', () => {
    const { pid, draft } = buildSaved(PONDASI_TEXT);
    // Prasyarat: draft pondasi tanpa tipe memang BLOCKED (gap kritis).
    expect(draftReadiness(draft).status).toBe('BLOCKED');
    const preview = previewOf(draft, pid, 'ubah luas menjadi 120 m2');
    expect(draftReadiness(preview.candidate).status).toBe('BLOCKED');

    const draftBefore = canon(draft);
    const storeBefore = storageSnapshot();
    const writesBefore = totalWrites();
    const res = activateRevision(pid, preview);

    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('unreachable');
    expect(res.error).toBe('DRAFT_NOT_READY');
    expect(res.message).toContain('belum dapat diaktifkan');
    expect(res.message).toContain('Jenis pondasi');
    expect(res.message).toContain('tidak berubah');
    // Revisi aktif tidak berubah: record, singleton, storage utuh.
    const rec = peekPersistedDraft(pid)!;
    expect(rec.baseVersion).toBe(1);
    expect(rec.versionHistory ?? []).toHaveLength(0);
    expect(canon(draft)).toBe(draftBefore);
    expect(storageSnapshot()).toBe(storeBefore);
    expect(totalWrites()).toBe(writesBefore);
  });

  it('jalur mutasi: kandidat dengan parameter wajib hilang → ditolak, storage byte-identik', () => {
    const { pid, draft } = buildSaved(MULTI_TEXT);
    const preview = previewOf(draft, pid, 'gedung B jadi 3 lantai');
    expect(draftReadiness(preview.candidate).status).toBe('NEEDS_SPEC');
    // Mutasi kandidat: part pertama kehilangan parameter wajib.
    const part = preview.candidate.parts[0];
    part.generation.generationStatus = 'INCOMPLETE_MISSING_PARAMS';
    part.generation.missingRequiredParams = ['panjang'];
    expect(draftReadiness(preview.candidate).status).toBe('BLOCKED');

    const storeBefore = storageSnapshot();
    const writesBefore = totalWrites();
    const activeBefore = canon(draft);
    const res = activateRevision(pid, preview);

    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('unreachable');
    expect(res.error).toBe('DRAFT_NOT_READY');
    expect(res.message).toContain('parameter wajib belum lengkap');
    expect(peekPersistedDraft(pid)!.baseVersion).toBe(1);
    expect(canon(draft)).toBe(activeBefore);
    expect(storageSnapshot()).toBe(storeBefore);
    expect(totalWrites()).toBe(writesBefore);
  });

  it('jalur mutasi: kandidat dengan volume INVALID → ditolak', () => {
    const { pid, draft } = buildSaved(MULTI_TEXT);
    const preview = previewOf(draft, pid, 'gedung B jadi 3 lantai');
    const firstItem = preview.candidate.parts[0].generation.items[0];
    firstItem.notes = 'Volume: INVALID — volume tidak dapat dihitung';
    expect(draftReadiness(preview.candidate).status).toBe('BLOCKED');

    const res = activateRevision(pid, preview);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('unreachable');
    expect(res.error).toBe('DRAFT_NOT_READY');
    expect(res.message).toContain('Volume INVALID');
    expect(peekPersistedDraft(pid)!.baseVersion).toBe(1);
    expect(peekPersistedDraft(pid)!.versionHistory ?? []).toHaveLength(0);
  });

  it('penolakan tidak mengonsumsi kunci: kandidat yang diperbaiki dapat diaktifkan', () => {
    const { pid, draft } = buildSaved(MULTI_TEXT);
    const preview = previewOf(draft, pid, 'gedung B jadi 3 lantai');
    const part = preview.candidate.parts[0];
    const origStatus = part.generation.generationStatus;
    const origMissing = part.generation.missingRequiredParams;
    part.generation.generationStatus = 'INCOMPLETE_MISSING_PARAMS';
    part.generation.missingRequiredParams = ['panjang'];

    const rejected = activateRevision(pid, preview);
    expect(rejected.ok).toBe(false);
    expect(peekPersistedDraft(pid)!.versionHistory ?? []).toHaveLength(0);

    // Perbaiki kandidat (kunci aktivasi sama — diturunkan dari teks
    // permintaan, bukan isi kandidat) lalu aktifkan: harus berhasil,
    // dan hanya SATU versi baru yang tercipta.
    part.generation.generationStatus = origStatus;
    part.generation.missingRequiredParams = origMissing;
    expect(draftReadiness(preview.candidate).status).not.toBe('BLOCKED');
    const res = activateRevision(pid, preview);
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('unreachable');
    expect(res.alreadyActivated).toBe(false);
    expect(res.version).toBe(2);
    expect((peekPersistedDraft(pid)!.versionHistory ?? []).length).toBe(2);
    void draft;
  });
});

/* ================================================================== */
/* (b) Aktivasi revisi siap tetap berhasil                             */
/* ================================================================== */

describe('P4 — aktivasi revisi siap tetap berhasil', () => {
  it('kandidat NEEDS_SPEC (kanonis multi-gedung) tetap diaktifkan', () => {
    const { pid, draft } = buildSaved(MULTI_TEXT);
    const preview = previewOf(draft, pid, 'gedung B jadi 3 lantai');
    // Bar yang sama dengan guard transfer: NEEDS_SPEC bukan blokir.
    expect(draftReadiness(preview.candidate).status).toBe('NEEDS_SPEC');
    const res = activateRevision(pid, preview);
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error(`aktivasi NEEDS_SPEC gagal: ${JSON.stringify(res)}`);
    expect(res.version).toBe(2);
    expect(peekPersistedDraft(pid)!.baseVersion).toBe(2);
    void draft;
  });

  it('kandidat READY penuh (sintetis: semua item terpetakan + berharga) diaktifkan', () => {
    const { pid, draft } = buildSaved(MULTI_TEXT);
    const preview = previewOf(draft, pid, 'gedung B jadi 3 lantai');
    // Fixture sintetis: petakan semua item + beri status harga valid
    // agar draftReadiness mencapai READY (bukan data produksi).
    for (const part of preview.candidate.parts) {
      for (const item of part.generation.items) {
        if (item.ahspMappingStatus === 'NEEDS_MAPPING') {
          item.ahspMappingStatus = 'NOT_APPLICABLE';
        }
        if (item.priceStatus === 'PRICE_UNRESOLVED') {
          item.priceStatus = 'PRICE_RESOLVED';
          item.unitPrice = 1000;
        }
      }
    }
    expect(draftReadiness(preview.candidate).status).toBe('READY');
    const res = activateRevision(pid, preview);
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error(`aktivasi READY gagal: ${JSON.stringify(res)}`);
    expect(res.version).toBe(2);
    expect(effectiveItems(preview.candidate).length).toBeGreaterThan(0);
    void draft;
  });
});

/* ================================================================== */
/* (c)(d)(e) Sifat yang sudah ada tetap berlaku                        */
/* ================================================================== */

describe('P4 — sifat aktivasi yang sudah ada tetap berlaku', () => {
  it('(c) idempotent: kunci sama → alreadyActivated, tanpa duplikasi, tanpa tulis kedua', () => {
    const { pid, draft } = buildSaved(MULTI_TEXT);
    const preview = previewOf(draft, pid, 'gedung B jadi 3 lantai');
    const a1 = activateRevision(pid, preview);
    expect(a1.ok).toBe(true);
    if (!a1.ok) throw new Error('unreachable');
    expect(a1.alreadyActivated).toBe(false);
    const histBefore = JSON.stringify(peekPersistedDraft(pid)!.versionHistory);
    const writesBefore = totalWrites();
    const storeBefore = storageSnapshot();

    const a2 = activateRevision(pid, preview);
    expect(a2.ok).toBe(true);
    if (!a2.ok) throw new Error('unreachable');
    expect(a2.alreadyActivated).toBe(true);
    expect(a2.version).toBe(2);
    expect(peekPersistedDraft(pid)!.baseVersion).toBe(2);
    expect(JSON.stringify(peekPersistedDraft(pid)!.versionHistory)).toBe(histBefore);
    expect(totalWrites()).toBe(writesBefore);
    expect(storageSnapshot()).toBe(storeBefore);
    void draft;
  });

  it('(d) versi lama byte-identik sesudah aktivasi versi baru', () => {
    const { pid, draft } = buildSaved(MULTI_TEXT);
    const v1Canon = canon(draft);
    const preview = previewOf(draft, pid, 'gedung B jadi 3 lantai');
    const res = activateRevision(pid, preview);
    expect(res.ok).toBe(true);
    const rec = peekPersistedDraft(pid)!;
    expect((rec.versionHistory ?? []).length).toBe(2);
    const seed = rec.versionHistory!.find((h) => h.version === 1)!;
    expect(seed).toBeDefined();
    expect(canon(seed.draft)).toBe(v1Canon);
    // Revisi kedua: v1 harus TETAP identik.
    const active2 = preview.candidate;
    const p2 = previewOf(active2, pid, 'gedung B jadi 4 lantai');
    const a2 = activateRevision(pid, p2);
    expect(a2.ok).toBe(true);
    const rec2 = peekPersistedDraft(pid)!;
    const seed2 = rec2.versionHistory!.find((h) => h.version === 1)!;
    expect(canon(seed2.draft)).toBe(v1Canon);
    expect((rec2.versionHistory ?? []).length).toBe(3);
  });

  it('(e) gagal aktivasi (guard konkurensi stale) tidak merusak revisi aktif', () => {
    const { pid, draft } = buildSaved(MULTI_TEXT);
    const p1 = previewOf(draft, pid, 'gedung B jadi 3 lantai');
    const p2 = previewOf(draft, pid, 'gedung B jadi 4 lantai');
    const a1 = activateRevision(pid, p1);
    expect(a1.ok).toBe(true);
    const storeAfterWin = storageSnapshot();
    const writesAfterWin = totalWrites();
    const activeCanon = canon(peekPersistedDraft(pid));

    const a2 = activateRevision(pid, p2);
    expect(a2.ok).toBe(false);
    if (a2.ok) throw new Error('unreachable');
    expect(a2.stale).toBe(true);
    expect(a2.error).toBe('DRAFT_VERSION_CONFLICT');
    // Pemenang utuh: record, storage, dan hitungan tulis tidak berubah.
    expect(peekPersistedDraft(pid)!.baseVersion).toBe(2);
    expect(canon(peekPersistedDraft(pid))).toBe(activeCanon);
    expect(storageSnapshot()).toBe(storeAfterWin);
    expect(totalWrites()).toBe(writesAfterWin);
    expect((peekPersistedDraft(pid)!.versionHistory ?? []).length).toBe(2);
  });
});

/* ================================================================== */
/* (g) Kontrak-sumber: guard di dalam activateRevision                 */
/* ================================================================== */

describe('P4 — kontrak sumber guard', () => {
  it('guard berada di dalam activateRevision dan memakai ulang draftReadiness', () => {
    const src = readFileSync(
      new URL('../ai-tools/ezrab-ai/draftRevision.ts', import.meta.url),
      'utf8',
    );
    // Guard mengevaluasi kandidat lewat draftReadiness yang sama.
    expect(src).toContain('draftReadiness(preview.candidate)');
    expect(src).toContain("error: 'DRAFT_NOT_READY'");
    // Diimpor dari universalRab (modul yang sama dengan guard transfer).
    expect(src).toContain('draftReadiness,');
    // Tidak ada logika kesiapan baru di modul ini: tidak ada fungsi
    // kesiapan/blocked buatan sendiri.
    expect(src).not.toMatch(/function\s+\w*[Rr]eadiness\w*\s*\(/);
    expect(src).not.toMatch(/function\s+\w*[Bb]locked\w*\s*\(/);
    // Guard diletakkan SEBELUM penulisan (sebelum seed snapshot).
    const guardAt = src.indexOf('draftReadiness(preview.candidate)');
    const seedAt = src.indexOf('Seed: snapshot keadaan aktif');
    const writeAt = src.indexOf('writeDraftRecord(nextRecord)');
    expect(guardAt).toBeGreaterThan(-1);
    expect(seedAt).toBeGreaterThan(guardAt);
    expect(writeAt).toBeGreaterThan(guardAt);
  });

  it('pemanggil view.tsx memakai hasil activateRevision apa adanya (tanpa guard kedua)', () => {
    const view = readFileSync(
      new URL('../ai-tools/ezrab-ai/view.tsx', import.meta.url),
      'utf8',
    );
    expect(view).toContain('activateRevision(effProject.id, pending)');
    // Pesan penolakan dari activateRevision diteruskan ke chat.
    expect(view).toContain('runRevisionActivation');
  });
});

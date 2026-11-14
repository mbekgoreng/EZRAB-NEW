/**
 * G1 (K-04, Audit Fase 0 Skill Engine 2026-11-13) — pengikatan approval
 * transfer ke versi + hash draft yang DITINJAU di pratinjau.
 *
 * Yang diuji di sini (tanpa render React — handler view.tsx adalah
 * closure React, seperti pola draftPersistenceHardening):
 *  - helper murni `createTransferApprovalBinding` /
 *    `checkTransferApprovalBinding` (draftPersistence.ts): terima bila
 *    draft tidak berubah; tolak bila versi berubah, isi berubah pada
 *    versi sama (sidik), draft/proyek berganti, binding tidak ada,
 *    atau pratinjau kedaluwarsa (TTL 10 menit);
 *  - penolakan TIDAK menulis apa pun: nol tulis localStorage selama
 *    pemeriksaan + draft/binding tidak berubah (fungsi murni);
 *  - kontrak-sumber wiring view.tsx: cek binding dipanggil di
 *    pushUniversalToSpreadsheet SEBELUM tulis pertama, binding dibuat
 *    di pushUniversalToSpreadsheetPreview, approval dikonsumsi pada
 *    hasil terminal.
 *
 * Yang TIDAK diuji di sini (butuh browser, ditutup E2E pasca-perbaikan):
 *  klik tombol "Konfirmasi Transfer" → pesan penolakan tampil di chat.
 * Run: runner shim vitest (lihat run-magic-ai-fix-battery.sh).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import {
  buildUniversalDraft,
  setLastUniversalDraft,
  type UniversalDraft,
} from '../ai-tools/ezrab-ai/universalRab';
import {
  createTransferApprovalBinding,
  checkTransferApprovalBinding,
  TRANSFER_APPROVAL_TTL_MS,
  type TransferApprovalBinding,
} from '../ai-tools/ezrab-ai/draftPersistence';

/* ---------------- localStorage shim (dengan penghitung tulis) ------- */
/* Pola sama seperti suite draftPersistenceHardening. */
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

const PID = 'PRJ-G1-1';
const PID2 = 'PRJ-G1-2';
const T0 = 1_700_000_000_000;

function draftOf(text: string): UniversalDraft {
  const res = buildUniversalDraft(text);
  expect(res.kind).toBe('draft');
  if (res.kind !== 'draft') throw new Error('unreachable');
  return res.draft;
}

function totalWrites(): number {
  return Object.values(writeCounts).reduce((s, n) => s + n, 0);
}

beforeEach(() => {
  localStorage.clear();
  for (const k of Object.keys(writeCounts)) delete writeCounts[k];
  setLastUniversalDraft(null);
});

/* ================================================================== */
/* Terima: draft tidak berubah sejak pratinjau                         */
/* ================================================================== */

describe('G1 — transfer DITERIMA bila draft tidak berubah', () => {
  it('binding dari draft yang sama → ok', () => {
    const d = draftOf('buatkan RAB drainase U-Ditch sepanjang 500 meter');
    const b = createTransferApprovalBinding(d, PID, T0);
    expect(b.draftId).toBe(d.id);
    expect(b.projectId).toBe(PID);
    expect(b.version).toBe(d.version);
    expect(b.createdAt).toBe(T0);
    expect(typeof b.fingerprint).toBe('string');
    expect(b.fingerprint.length).toBeGreaterThan(0);
    expect(checkTransferApprovalBinding(b, d, PID, T0)).toEqual({ ok: true });
  });

  it('salinan draft yang identik isinya (objek berbeda) → ok', () => {
    const d = draftOf('buatkan RAB jalan paving 300 m2');
    const b = createTransferApprovalBinding(d, PID, T0);
    // Klon dalam via JSON: objek baru, isi identik → sidik sama.
    const clone = JSON.parse(JSON.stringify(d)) as UniversalDraft;
    expect(checkTransferApprovalBinding(b, clone, PID, T0)).toEqual({ ok: true });
  });

  it('tepat di batas TTL (createdAt + 10 menit) → masih ok', () => {
    const d = draftOf('buatkan RAB drainase U-Ditch sepanjang 500 meter');
    const b = createTransferApprovalBinding(d, PID, T0);
    expect(checkTransferApprovalBinding(b, d, PID, T0 + TRANSFER_APPROVAL_TTL_MS)).toEqual({ ok: true });
  });

  it('TTL = 10 menit, sama dengan PLAN_TTL_MS operations.ts', () => {
    expect(TRANSFER_APPROVAL_TTL_MS).toBe(10 * 60 * 1000);
  });
});

/* ================================================================== */
/* Tolak: draft berubah sesudah pratinjau                              */
/* ================================================================== */

describe('G1 — transfer DITOLAK bila draft berubah sesudah pratinjau', () => {
  it('versi berubah (isi lain sama) → DRAFT_CHANGED + pesan baku', () => {
    const d = draftOf('buatkan RAB drainase U-Ditch sepanjang 500 meter');
    const b = createTransferApprovalBinding(d, PID, T0);
    const changed: UniversalDraft = { ...d, version: d.version + 1 };
    const res = checkTransferApprovalBinding(b, changed, PID, T0);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('unreachable');
    expect(res.reason).toBe('DRAFT_CHANGED');
    expect(res.message).toBe('Draft berubah sesudah pratinjau — tinjau ulang sebelum transfer.');
  });

  it('isi berubah pada versi SAMA (asumsi bertambah) → DRAFT_CHANGED', () => {
    const d = draftOf('buatkan RAB drainase U-Ditch sepanjang 500 meter');
    const b = createTransferApprovalBinding(d, PID, T0);
    const changed: UniversalDraft = {
      ...d,
      assumptions: [...d.assumptions, 'asumsi tambahan sesudah pratinjau'],
    };
    const res = checkTransferApprovalBinding(b, changed, PID, T0);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('unreachable');
    expect(res.reason).toBe('DRAFT_CHANGED');
  });

  it('isi berubah pada versi SAMA (part dihapus) → DRAFT_CHANGED', () => {
    const d = draftOf('buatkan RAB jalan paving 300 m2');
    expect(d.parts.length).toBeGreaterThan(0);
    const b = createTransferApprovalBinding(d, PID, T0);
    const changed: UniversalDraft = { ...d, parts: d.parts.slice(0, -1) };
    const res = checkTransferApprovalBinding(b, changed, PID, T0);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('unreachable');
    expect(res.reason).toBe('DRAFT_CHANGED');
  });

  it('draft lain (id berbeda) → DRAFT_CHANGED', () => {
    const d = draftOf('buatkan RAB drainase U-Ditch sepanjang 500 meter');
    const other = draftOf('buatkan RAB jalan paving 300 m2');
    expect(other.id).not.toBe(d.id);
    const b = createTransferApprovalBinding(d, PID, T0);
    const res = checkTransferApprovalBinding(b, other, PID, T0);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('unreachable');
    expect(res.reason).toBe('DRAFT_CHANGED');
  });

  it('draft tidak lagi aktif (null) → DRAFT_CHANGED', () => {
    const d = draftOf('buatkan RAB drainase U-Ditch sepanjang 500 meter');
    const b = createTransferApprovalBinding(d, PID, T0);
    const res = checkTransferApprovalBinding(b, null, PID, T0);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('unreachable');
    expect(res.reason).toBe('DRAFT_CHANGED');
  });

  it('proyek aktif berganti → PROJECT_CHANGED', () => {
    const d = draftOf('buatkan RAB drainase U-Ditch sepanjang 500 meter');
    const b = createTransferApprovalBinding(d, PID, T0);
    const res = checkTransferApprovalBinding(b, d, PID2, T0);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('unreachable');
    expect(res.reason).toBe('PROJECT_CHANGED');
    expect(res.message).toContain('Proyek aktif sudah berganti');
  });

  it('tanpa binding (pratinjau sudah dipakai / sesi dimuat ulang) → NO_BINDING', () => {
    const d = draftOf('buatkan RAB drainase U-Ditch sepanjang 500 meter');
    const res = checkTransferApprovalBinding(null, d, PID, T0);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('unreachable');
    expect(res.reason).toBe('NO_BINDING');
  });

  it('melewati TTL 10 menit → EXPIRED', () => {
    const d = draftOf('buatkan RAB drainase U-Ditch sepanjang 500 meter');
    const b = createTransferApprovalBinding(d, PID, T0);
    const res = checkTransferApprovalBinding(b, d, PID, T0 + TRANSFER_APPROVAL_TTL_MS + 1);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('unreachable');
    expect(res.reason).toBe('EXPIRED');
    expect(res.message).toContain('kedaluwarsa');
  });
});

/* ================================================================== */
/* Penolakan tidak menulis apa pun                                     */
/* ================================================================== */

describe('G1 — penolakan TIDAK menulis apa pun', () => {
  it('semua jalur penolakan: nol tulis localStorage', () => {
    const d = draftOf('buatkan RAB drainase U-Ditch sepanjang 500 meter');
    const b = createTransferApprovalBinding(d, PID, T0);
    const changed: UniversalDraft = { ...d, version: d.version + 1 };
    expect(totalWrites()).toBe(0);
    checkTransferApprovalBinding(b, changed, PID, T0);
    checkTransferApprovalBinding(b, d, PID2, T0);
    checkTransferApprovalBinding(b, d, PID, T0 + TRANSFER_APPROVAL_TTL_MS + 1);
    checkTransferApprovalBinding(null, d, PID, T0);
    checkTransferApprovalBinding(b, null, PID, T0);
    // Jalur terima pun murni.
    checkTransferApprovalBinding(b, d, PID, T0);
    expect(totalWrites()).toBe(0);
  });

  it('pemeriksaan tidak mengubah draft maupun binding (fungsi murni)', () => {
    const d = draftOf('buatkan RAB jalan paving 300 m2');
    const b = createTransferApprovalBinding(d, PID, T0);
    const draftBefore = JSON.stringify(d);
    const bindingBefore = JSON.stringify(b);
    const changed: UniversalDraft = { ...d, assumptions: [...d.assumptions, 'x'] };
    checkTransferApprovalBinding(b, changed, PID, T0);
    checkTransferApprovalBinding(b, d, PID, T0);
    expect(JSON.stringify(d)).toBe(draftBefore);
    expect(JSON.stringify(b)).toBe(bindingBefore);
  });

  it('pembuatan binding tidak menulis storage', () => {
    const d = draftOf('buatkan RAB drainase U-Ditch sepanjang 500 meter');
    expect(totalWrites()).toBe(0);
    createTransferApprovalBinding(d, PID, T0);
    expect(totalWrites()).toBe(0);
  });
});

/* ================================================================== */
/* Kontrak-sumber: wiring view.tsx                                     */
/* ================================================================== */

describe('G1 — kontrak wiring view.tsx (kontrak-sumber)', () => {
  const viewSrc = readFileSync(new URL('../ai-tools/ezrab-ai/view.tsx', import.meta.url), 'utf8');

  it('cek binding ada di pushUniversalToSpreadsheet SEBELUM tulis pertama', () => {
    const handlerAt = viewSrc.indexOf('const pushUniversalToSpreadsheet = ()');
    expect(handlerAt).toBeGreaterThan(-1);
    const checkAt = viewSrc.indexOf(
      'checkTransferApprovalBinding(pendingTransferApprovalRef.current, d, effProject.id)',
      handlerAt,
    );
    expect(checkAt).toBeGreaterThan(handlerAt);
    // Tulis pertama handler adalah insertRabItemsVerified — cek binding
    // WAJIB mendahuluinya agar penolakan tidak menulis apa pun.
    const firstWriteAt = viewSrc.indexOf('insertRabItemsVerified(newItems', handlerAt);
    expect(firstWriteAt).toBeGreaterThan(handlerAt);
    expect(checkAt).toBeLessThan(firstWriteAt);
    // Penolakan mengembalikan lebih awal (return) sebelum tulis.
    const rejectReturnAt = viewSrc.indexOf('return;', checkAt);
    expect(rejectReturnAt).toBeGreaterThan(checkAt);
    expect(rejectReturnAt).toBeLessThan(firstWriteAt);
  });

  it('binding dibuat di pushUniversalToSpreadsheetPreview', () => {
    const previewAt = viewSrc.indexOf('const pushUniversalToSpreadsheetPreview = ()');
    expect(previewAt).toBeGreaterThan(-1);
    const createAt = viewSrc.indexOf('createTransferApprovalBinding(d, effProject.id)', previewAt);
    expect(createAt).toBeGreaterThan(previewAt);
    // Dibuat sebelum tombol konfirmasi dirangkai (binding ⟺ tombol ada).
    const buttonAt = viewSrc.indexOf("kind: 'push-universal-confirm'", previewAt);
    expect(buttonAt).toBeGreaterThan(previewAt);
    expect(createAt).toBeLessThan(buttonAt);
  });

  it('approval dikonsumsi (ref dikosongkan) pada penolakan + hasil terminal', () => {
    const handlerAt = viewSrc.indexOf('const pushUniversalToSpreadsheet = ()');
    expect(handlerAt).toBeGreaterThan(-1);
    const nextFnAt = viewSrc.indexOf('const getRetryPrompt', handlerAt);
    const handlerSrc = viewSrc.slice(handlerAt, nextFnAt);
    const clears = handlerSrc.split('pendingTransferApprovalRef.current = null').length - 1;
    // Minimal 3: penolakan, kwitansi duplikat, sukses transfer.
    expect(clears).toBeGreaterThanOrEqual(3);
  });

  it('pesan penolakan handler memakai pesan dari hasil cek (satu sumber)', () => {
    const handlerAt = viewSrc.indexOf('const pushUniversalToSpreadsheet = ()');
    const msgAt = viewSrc.indexOf('${approval.message}', handlerAt);
    expect(msgAt).toBeGreaterThan(handlerAt);
  });
});

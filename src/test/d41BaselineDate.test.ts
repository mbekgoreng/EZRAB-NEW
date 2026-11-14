/**
 * D-41 (Batch F, P3) — Baseline v1.0 bertanggal "1 Sep 2026" untuk
 * proyek yang dibuat 14 Nov 2026.
 *
 * Perbaikan tanggal SELESAI sebagai efek samping Batch A (D-43):
 * timestamp baseline = project createdAt. Tes ini adalah regresi
 * yang membuktikan itu — plus sisa Batch F: penulis & catatan
 * baseline yang dulu menyajikan artefak otomatis sebagai hasil
 * verifikasi manusia ('Lead Estimator (EZRAB)' + 'Versi dasar
 * terverifikasi') kini jujur ('EZRAB (otomatis)' + 'Baseline
 * otomatis dari item RAB saat ini.').
 *
 * Jalankan: npx tsx src/test/d41BaselineDate.test.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'node:url';
// tsx menjalankan berkas ini sebagai ESM: __dirname tidak tersedia.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
import {
  buildBaselineVersion,
  ensureBaselineVersion,
  BASELINE_AUTHOR,
  BASELINE_DESCRIPTION,
  BASELINE_REVISION_NOTES,
} from '../engine/estimateVersioning';
import type { RabItem } from '../types';

let failures = 0;
let passes = 0;
function test(name: string, fn: () => void): void {
  try {
    fn();
    passes++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${(e as Error).message}`);
  }
}
function ok(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}
function eq(actual: unknown, expected: unknown, msg: string): void {
  if (actual !== expected) {
    throw new Error(`${msg} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
function contains(haystack: string, needle: string, msg: string): void {
  ok(haystack.includes(needle), `${msg} — tidak ditemukan: ${JSON.stringify(needle)}`);
}
function notContains(haystack: string, needle: string, msg: string): void {
  ok(!haystack.includes(needle), `${msg} — seharusnya tidak ada: ${JSON.stringify(needle)}`);
}

const OLD_HARDCODE = '2026-09-01T08:30:00.000Z';
const CREATED_AT = '2026-11-14T10:00:00.000Z';
const items: RabItem[] = [
  { id: 'r1', projectId: 'PRJ-T41', description: 'Item', volume: 1, unit: 'ls', unitPrice: 1000, amount: 1000 } as RabItem,
];

console.log('D-41 — Tanggal baseline = createdAt proyek; label jujur:');

console.log('\n[1] Timestamp baseline (engine):');
test('buildBaselineVersion memakai baselineTimestamp dari pemanggil', () => {
  const v = buildBaselineVersion('PRJ-T41', items, { baselineTimestamp: CREATED_AT });
  eq(v.timestamp, CREATED_AT, 'timestamp baseline');
  eq(v.isBaseline, true, 'isBaseline');
});
test('ensureBaselineVersion meneruskan baselineTimestamp', () => {
  const ensured = ensureBaselineVersion([], 'PRJ-T41', items, { baselineTimestamp: CREATED_AT });
  eq(ensured.versions.length, 1, 'satu baseline dibuat');
  eq(ensured.versions[0].timestamp, CREATED_AT, 'timestamp baseline terjamin');
});
test('tanpa baselineTimestamp: timestamp adalah "sekarang", bukan hardcode lama', () => {
  const before = Date.now();
  const v = buildBaselineVersion('PRJ-T41', items);
  const after = Date.now();
  const ts = Date.parse(v.timestamp);
  ok(Number.isFinite(ts), 'timestamp bisa diparse');
  ok(ts >= before - 1000 && ts <= after + 1000, `timestamp mendekati sekarang (got ${v.timestamp})`);
  ok(v.timestamp !== OLD_HARDCODE, 'bukan hardcode 1 Sep 2026');
});

console.log('\n[2] Penulis & catatan jujur:');
test('penulis baseline adalah sistem, bukan manusia fiktif', () => {
  eq(BASELINE_AUTHOR, 'EZRAB (otomatis)', 'BASELINE_AUTHOR');
});
test('catatan baseline tidak mengklaim verifikasi manual', () => {
  eq(BASELINE_REVISION_NOTES, 'Baseline otomatis dari item RAB saat ini.', 'BASELINE_REVISION_NOTES');
  ok(!BASELINE_REVISION_NOTES.toLowerCase().includes('terverifikasi'), 'tanpa kata "terverifikasi"');
});
test('deskripsi baseline tetap menjelaskan apa itu baseline', () => {
  eq(BASELINE_DESCRIPTION, 'Baseline Master Anggaran Proyek Hasil QTO & AHSP Standar', 'BASELINE_DESCRIPTION');
});
test('baseline yang dibangun memakai konstanta jujur', () => {
  const v = buildBaselineVersion('PRJ-T41', items, { baselineTimestamp: CREATED_AT });
  eq(v.author, 'EZRAB (otomatis)', 'author');
  eq(v.revisionNotes, 'Baseline otomatis dari item RAB saat ini.', 'revisionNotes');
});

console.log('\n[3] Struktural — tidak ada literal lama di jalur versioning:');
const versioningPath = path.join(__dirname, '../engine/estimateVersioning.ts');
const versioningSrc = fs.readFileSync(versioningPath, 'utf8');
const ctxPath = path.join(__dirname, '../context/ProjectContext.tsx');
const ctxSrc = fs.readFileSync(ctxPath, 'utf8');
test('hardcode tanggal lama hilang dari engine + konteks', () => {
  notContains(versioningSrc, OLD_HARDCODE, 'estimateVersioning.ts');
  notContains(ctxSrc, OLD_HARDCODE, 'ProjectContext.tsx');
});
test('label manusia fiktif hilang dari engine + konteks', () => {
  notContains(versioningSrc, 'Lead Estimator (EZRAB)', 'estimateVersioning.ts');
  notContains(ctxSrc, 'Lead Estimator (EZRAB)', 'ProjectContext.tsx');
  notContains(versioningSrc, 'Versi dasar terverifikasi', 'estimateVersioning.ts');
  notContains(ctxSrc, 'Versi dasar terverifikasi', 'ProjectContext.tsx');
});
test('memo virtual memakai createdAt + konstanta engine', () => {
  contains(ctxSrc, 'timestamp: currentProject?.createdAt', 'memo virtual memakai createdAt');
  contains(ctxSrc, 'author: BASELINE_AUTHOR', 'memo virtual memakai konstanta penulis');
  contains(ctxSrc, 'revisionNotes: BASELINE_REVISION_NOTES', 'memo virtual memakai konstanta catatan');
  contains(ctxSrc, 'baselineTimestamp: targetProject?.createdAt', 'createRevision meneruskan createdAt');
});

console.log(`\nHasil D-41: ${passes} lolos, ${failures} gagal`);
if (failures > 0) process.exit(1);
console.log('SEMUA TEST D-41 LOLOS');

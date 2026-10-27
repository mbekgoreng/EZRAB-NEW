/**
 * EZRAB DED–RAB — Sinkronisasi spesifikasi klasifikasi WBS.
 *
 * Sumber: src/ai-tools/ded-ai-estimate/prompts/work-classification.md
 * Keluaran: src/ai-tools/ded-ai-estimate/prompts/work-classification.generated.ts
 *   (modul string TypeScript yang diimpor builder prompt runtime).
 *
 * Kenapa tidak `?raw`: impor Markdown mentah tidak bisa dibundel oleh
 * pola tes repo ini (esbuild: "No loader is configured for .md files"),
 * sementara file `.generated.ts` yang di-commit adalah pola yang sudah
 * dipakai repo (mis. ahsp2026Canonical.generated.ts).
 *
 * Pemakaian:
 *   node scripts/sync-work-classification.mjs          # tulis ulang modul
 *   node scripts/sync-work-classification.mjs --check   # gagal bila modul
 *                                                       tidak sinkron
 * Setelah mengedit .md, jalankan skrip ini dan sertakan kedua file
 * (md + generated) dalam perubahan yang sama.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MD_PATH = path.join(ROOT, 'src', 'ai-tools', 'ded-ai-estimate', 'prompts', 'work-classification.md');
const OUT_PATH = path.join(ROOT, 'src', 'ai-tools', 'ded-ai-estimate', 'prompts', 'work-classification.generated.ts');

const md = fs.readFileSync(MD_PATH, 'utf8');
const hash = createHash('sha256').update(md, 'utf8').digest('hex');

const out = `/**
 * DED-to-RAB — Spesifikasi klasifikasi WBS (GENERATED — JANGAN DIEDIT).
 *
 * Sumber: src/ai-tools/ded-ai-estimate/prompts/work-classification.md
 * SHA-256 sumber: ${hash}
 * Regenerasi: node scripts/sync-work-classification.mjs
 * (cek sinkron: node scripts/sync-work-classification.mjs --check)
 *
 * Modul ini diimpor oleh ketiga builder prompt DED (fast.ts, detail.ts,
 * dan prompts.ts mesin Full AI) sehingga katalog klasifikasi hanya
 * ditulis sekali dan dipakai semua jalur runtime.
 */
export const WORK_CLASSIFICATION_SPEC = ${JSON.stringify(md)};

export const WORK_CLASSIFICATION_SPEC_SHA256 = ${JSON.stringify(hash)};
`;

if (process.argv.includes('--check')) {
  const current = fs.existsSync(OUT_PATH) ? fs.readFileSync(OUT_PATH, 'utf8') : '';
  if (current !== out) {
    console.error('work-classification.generated.ts tidak sinkron dengan work-classification.md.');
    console.error('Jalankan: node scripts/sync-work-classification.mjs');
    process.exit(1);
  }
  console.log('work-classification.generated.ts sinkron.');
} else {
  fs.writeFileSync(OUT_PATH, out, 'utf8');
  console.log(`Ditulis: ${path.relative(ROOT, OUT_PATH)} (sha256 ${hash.slice(0, 12)})`);
}

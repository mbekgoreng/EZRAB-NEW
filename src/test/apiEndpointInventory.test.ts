/**
 * API ENDPOINT INVENTORY AUDIT — audit kesiapan deploy publik (area API & routes).
 *
 * Memastikan kontrak serverless Vercel untuk semua handler di api/:
 *  - setiap file handler (di luar api/_lib milik tim Security) mengekspor
 *    `default` function (req, res).
 *  - inventaris endpoint terdokumentasi di bawah ini agar drift antara
 *    frontend fetch-target dan handler server langsung ketahuan.
 *
 * INVENTARIS ENDPOINT SERVER (2026-10-17):
 *   POST /api/ai/chat                    -> api/ai/chat.js (gateway wrapper)
 *   GET  /api/ai/engine-status           -> api/ai/engine-status.js (health, counts saja)
 *   POST /api/ai/tools/execute           -> api/ai/tools/execute.js (gateway wrapper, productId->mode)
 *   POST /api/ai/multi-provider/execute  -> api/ai/multi-provider/execute.js (gateway wrapper)
 *   GET  /api/ai/multi-provider/providers-> api/ai/multi-provider/providers.js (availability saja)
 *
 * TIDAK ADA di server (frontend memanggil, dapat 404 — lihat laporan audit):
 *   - /api/ai/actions/confirm            (aiApiClient.confirmAction — dead code, tak dipanggil)
 *   - /api/ai/conversations              (aiApiClient.getConversations — dead code, tak dipanggil)
 *   - /api/assistant/wizard/*            (5 method — deprecated, 404 ditangkap caller -> resolver client-side)
 *   - /api/projects/:id/ded-analyses     (3 pola — fallback diam-diam ke Supabase/localStorage)
 *   - /api/ai/receipt/scan               (gagal jujur client-side; butuh dukungan vision di gateway tim Security)
 *
 * Jalankan: npx tsx src/test/apiEndpointInventory.test.ts
 */

import { readdirSync, statSync } from 'fs';
import { join, relative, dirname } from 'path';
import { fileURLToPath } from 'url';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`);
  }
}

const API_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../api');

function jsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...jsFiles(p));
    else if (e.endsWith('.js')) out.push(p);
  }
  return out;
}

console.log('\n[1] Kontrak handler Vercel (default export function):');
{
  const handlers = jsFiles(API_DIR).filter((f) => !f.includes('_lib'));
  check(`ditemukan ${handlers.length} handler di luar _lib`, handlers.length === 5, handlers.map((f) => relative(API_DIR, f)).join(', '));
  for (const f of handlers) {
    const mod = await import(f);
    const rel = relative(API_DIR, f);
    check(`${rel} mengekspor default function`, typeof mod.default === 'function');
  }
}

console.log('\n[2] api/_lib milik tim Security — tidak diubah auditor:');
{
  const lib = jsFiles(join(API_DIR, '_lib'));
  check(`_lib berisi ${lib.length} file utilitas (bukan endpoint publik langsung)`, lib.length >= 3, lib.map((f) => relative(API_DIR, f)).join(', '));
}

console.log(`\nHasil: ${passed} lolos, ${failed} gagal`);
if (failed > 0) {
  console.log('GAGAL:', failures.join(', '));
  process.exit(1);
}
console.log('SEMUA TEST API INVENTORY LOLOS');

/**
 * EXTRACT — SE DJBK No. 47/SE/Dk/2026, all available attachments, page by page.
 *
 * Produces `data/ahsp2026/raw/<key>_raw.jsonl` — one JSON record per PDF page,
 * carrying `raw_lines` (reconstructed visual rows) and `raw_text`.
 *
 * Nothing is interpreted here: this is the RAW layer (§6, §7 of the master prompt).
 * Every downstream record can be traced back to a (source_file, source_page) pair.
 *
 * Usage:
 *   npx tsx scripts/ahsp2026/extractRaw.ts              # all sources
 *   npx tsx scripts/ahsp2026/extractRaw.ts sda ck       # selected sources (by key)
 *   npx tsx scripts/ahsp2026/extractRaw.ts --force      # ignore resume cache
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { extractSource } from './core';
import { SOURCES } from './sources.config';

const WS = process.cwd();
const OUT_DIR = path.join(WS, 'data', 'ahsp2026', 'raw');

/** Aliases so `sda ck` etc. work from the CLI. */
const ALIAS: Record<string, string> = {
  smkk: 'smkk',
  sda: 'sda',
  ck: 'ciptakarya',
  ciptakarya: 'ciptakarya',
  bm: 'binamarga',
  binamarga: 'binamarga',
};

async function main() {
  const argv = process.argv.slice(2);
  const force = argv.includes('--force');
  const keys = argv.filter((a) => !a.startsWith('--')).map((a) => ALIAS[a] ?? a);

  const selected = keys.length > 0 ? SOURCES.filter((s) => keys.includes(s.key)) : SOURCES;
  if (selected.length === 0) {
    console.error(`No matching source. Available: ${SOURCES.map((s) => s.key).join(', ')}`);
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const started = Date.now();

  for (const spec of selected) {
    const out = path.join(OUT_DIR, `${spec.key}_raw.jsonl`);
    // Resumable: skip a source that is already fully extracted.
    const expected = fs.existsSync(out) ? fs.readFileSync(out, 'utf8').split('\n').filter((l) => l.trim()).length : 0;
    if (!force && fs.existsSync(out) && expected > 300) {
      console.log(`[skip] ${spec.key}: ${expected} pages already extracted -> ${path.relative(WS, out)}`);
      continue;
    }
    await extractSource(spec, out);
  }

  console.log(`\nTOTAL ${((Date.now() - started) / 1000).toFixed(0)}s`);
}

main().catch((e) => { console.error('EXTRACT FAILED:', e?.message || e); process.exit(1); });

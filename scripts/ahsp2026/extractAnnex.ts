/**
 * ONE-OFF — extract a single arbitrary annex PDF into the raw JSONL layer.
 *
 * Used during Phase 0.5 forensics to bring in the previously-missing
 * Lampiran II ("Acuan dalam Penyusunan AHSP") and Lampiran VII ("Tata Cara
 * Pengajuan Usulan AHSP"), neither of which is an AHSP item list but both of
 * which are part of SE DJBK No. 47/SE/Dk/2026 and must be accounted for.
 *
 * Usage: npx tsx scripts/ahsp2026/extractAnnex.ts <key> <attachment> <field> <pdfPath>
 */

import * as path from 'node:path';
import { SourceSpec, extractSource } from './core';

async function main() {
  const [key, attachment, field, pdfPath] = process.argv.slice(2);
  if (!key || !attachment || !field || !pdfPath) {
    console.error('Usage: npx tsx scripts/ahsp2026/extractAnnex.ts <key> <attachment> <field> <pdfPath>');
    process.exit(1);
  }
  const spec: SourceSpec = { key, attachment, field, pdfPath: path.resolve(pdfPath) };
  const out = path.join(process.cwd(), 'data', 'ahsp2026', 'raw', `${key}_raw.jsonl`);
  await extractSource(spec, out);
}

main().catch((e) => { console.error('EXTRACT FAILED:', e?.message || e); process.exit(1); });

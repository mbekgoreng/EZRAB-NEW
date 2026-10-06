/**
 * EZRAB AHSP 2026 — PHASE B: LEGACY BACKUP
 * ========================================
 *
 * Copies EVERY legacy AHSP storage artefact to
 *   backups/legacy-ahsp-pre-2026-purge/
 * and writes a MANIFEST.json with size + sha256 + declared item counts.
 *
 * This runs BEFORE any purge. If a backup file cannot be written, the script
 * exits non-zero and the purge must NOT proceed (fail-closed).
 *
 * Usage: npx tsx scripts/ahsp2026/backupLegacyAhsp.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const DEST = path.join(ROOT, 'backups', 'legacy-ahsp-pre-2026-purge');

/** Every legacy AHSP artefact, grouped by layer. */
const TARGETS: { layer: string; rel: string; note: string }[] = [
  // L1 — compiled catalog datasets
  { layer: 'L1', rel: 'src/data/nationalCostDatabase/sdaAHSPDataset.ts', note: 'SDA 2026 dataset (fabricated prices)' },
  { layer: 'L1', rel: 'src/data/nationalCostDatabase/binaMargaAHSPDataset.ts', note: 'Bina Marga FABRICATED (self-deprecated, 1144 items)' },
  { layer: 'L1', rel: 'src/data/nationalCostDatabase/binaMargaAHSP2026Official.ts', note: 'Bina Marga official extraction, MISLABELLED Lampiran II (must be V)' },
  { layer: 'L1', rel: 'src/data/nationalCostDatabase/binaMargaAHSP2026OfficialTypes.ts', note: 'Bina Marga official types + SOURCE_METADATA (Lampiran II mislabel)' },
  { layer: 'L1', rel: 'src/data/nationalCostDatabase/ciptaKaryaAHSPDataset.ts', note: 'Cipta Karya 2026 dataset (fabricated prices)' },
  { layer: 'L1', rel: 'src/data/nationalCostDatabase/smkkDataset.ts', note: 'SMKK Lampiran III dataset (fabricated prices)' },
  { layer: 'L1', rel: 'src/data/nationalCostDatabase/sources.ts', note: 'Official source metadata registry' },
  { layer: 'L1', rel: 'src/data/nationalCostDatabase/types.ts', note: 'NationalAHSPItem types (contains UMUM domain)' },
  { layer: 'L1', rel: 'src/data/nationalCostDatabase/masterRegistry.ts', note: 'Composite choke point ALL_OFFICIAL_AHSP_ITEMS + CostDatabaseEngine' },
  // L2 — legacy baseline
  { layer: 'L2', rel: 'src/data/indonesianAHSP.ts', note: 'MASTER_AHSP_DATABASE — Permen PUPR 1/2022 legacy baseline' },
  // L4 — in-memory repository
  { layer: 'L4', rel: 'src/engine/ahsp/repository/ahspRepository.ts', note: 'AHSPRepository singleton (ingests legacy 2022 + UMUM fallback)' },
  // L5 — server services
  { layer: 'L5', rel: 'server/services/ahspDataService.ts', note: 'Server AHSP search over legacy 2022 DB' },
  { layer: 'L5', rel: 'server/services/authoritativeAhspPriceBridge.ts', note: 'Bridge with fabricated 1150000 fallback' },
  // L6 — pipeline / adapter
  { layer: 'L6', rel: 'src/engine/ahsp/pipeline/ahspImportPipeline.ts', note: 'Import pipeline (UMUM fallback, unconditional VERIFIED)' },
  { layer: 'L6', rel: 'src/engine/ahsp/adapters/officialToDefinitionAdapter.ts', note: 'OfficialAHSPItem -> AHSPDefinition adapter' },
  { layer: 'L6', rel: 'src/engine/ahsp/contracts/types.ts', note: 'AHSPDefinition contracts' },
  // L6b — scope registry
  { layer: 'L6', rel: 'src/engine/cost/scope/scopeAhspRegistry.ts', note: 'Scope->AHSP registry (Lampiran II header, UMUM domain)' },
  // L7 — localStorage bridge
  { layer: 'L7', rel: 'src/project-data/ahspBridge.ts', note: 'Project AHSP bridge (localStorage ezrab:project:*:ahsp)' },
  { layer: 'L7', rel: 'src/project-data/repository.ts', note: 'ProjectDataRepository storage key impl' },
];

interface ManifestEntry {
  layer: string;
  source: string;
  backup: string;
  bytes: number;
  sha256: string;
  note: string;
  exists: boolean;
}

function sha256(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function main() {
  if (!fs.existsSync(DEST)) fs.mkdirSync(DEST, { recursive: true });

  const manifest: ManifestEntry[] = [];
  let copied = 0;
  let missing = 0;

  for (const t of TARGETS) {
    const src = path.join(ROOT, t.rel);
    const dstRel = t.rel.replace(/[\\/]/g, '__');
    const dst = path.join(DEST, dstRel);

    if (!fs.existsSync(src)) {
      missing++;
      manifest.push({ layer: t.layer, source: t.rel, backup: dstRel, bytes: 0, sha256: '', note: t.note, exists: false });
      continue;
    }
    const buf = fs.readFileSync(src);
    fs.writeFileSync(dst, buf);
    copied++;
    manifest.push({ layer: t.layer, source: t.rel, backup: dstRel, bytes: buf.length, sha256: sha256(buf), note: t.note, exists: true });
  }

  const out = {
    generated_at: new Date().toISOString(),
    purpose: 'Legacy AHSP backup prior to AHSP 2026 purge + reimport (Phase B).',
    restore_hint: 'Copy each backup file back to its "source" path to restore the pre-purge state.',
    counts: { targets: TARGETS.length, copied, missing },
    entries: manifest,
  };
  fs.writeFileSync(path.join(DEST, 'MANIFEST.json'), JSON.stringify(out, null, 2));

  console.log(`[backup] destination: ${path.relative(ROOT, DEST)}`);
  console.log(`[backup] targets=${TARGETS.length} copied=${copied} missing=${missing}`);
  for (const m of manifest) {
    const flag = m.exists ? 'OK ' : 'MISS';
    console.log(`  ${flag}  ${m.layer}  ${String(m.bytes).padStart(9)} B  ${m.source}`);
  }

  if (missing > 0) {
    console.error(`[backup] FAIL-CLOSED: ${missing} target(s) missing. Do NOT purge.`);
    process.exit(1);
  }
  console.log('[backup] complete — purge is authorised.');
}

main();

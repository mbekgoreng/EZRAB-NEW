/**
 * EZRAB PRICE 2026 — MASTER PRICING §14 (need #6): PRICE-CHANGE FEED TRAIL WRITER
 * =================================================================================
 *
 * Writes the interim append-only price-change feed trail:
 *   data/price2026/reports/price_change_feed.jsonl
 *
 * Run:
 *   npm run price:feed                        — ensure the trail exists (create with
 *                                               HEADER + BASELINE seed if missing),
 *                                               then report its status (no write
 *                                               when it already exists)
 *   npm run price:feed -- --from <file.json>  — append feed entries from a JSON
 *                                               array file (PriceChangeFeedInput[])
 *   npm run price:feed -- --trail <path>      — TEST SEAM: write to a different
 *                                               trail file instead of the real one
 *                                               (repo-relative or absolute)
 *
 * Behavior:
 *   - If the trail file does not exist, it is created with a HEADER line +
 *     the seed from §4.4 history (in practice the BASELINE marker only —
 *     history entries carry no resourceCode, so they are SKIPPED with
 *     reasons, never reconstructed by guessing codes; see
 *     seedFeedFromHistory). The seed is the honest starting state: the
 *     feed starts recording from §13 on.
 *   - If the file exists, it is first parsed and validated — a corrupt
 *     trail refuses the append (fail-closed).
 *   - `--from` entries are validated by buildPriceChangeFeedEntry (which
 *     assigns the deterministic content-hash id) and appended via
 *     appendPriceChangeFeedEntry (duplicate ids refused — the feed is
 *     append-only and idempotent by content hash).
 *
 * Where do `--from` files come from? The §13.2 workflow
 * (executeGlobalPriceChange) returns feed entries in memory; a workflow
 * runner serializes them (JSON array of PriceChangeFeedInput — the
 * builder assigns ids, so the file carries no ids) and hands the file
 * to this CLI. `price:sync` itself does not run the workflow (it runs
 * the pipeline), so it never writes feed entries directly.
 *
 * This trail is an INTERIM audit trail, NOT a replacement for the
 * server-side price_change_feed view over master_price_history
 * (supabase/migrations/20261116_master_price_governance.sql, NOT
 * APPLIED). Entries are never edited or deleted; corrections are new
 * entries. No prices are read, written, or changed by this script —
 * it only records price changes that already happened elsewhere.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  appendPriceChangeFeedEntry,
  buildPriceChangeFeedEntry,
  buildPriceChangeFeedJsonlHeader,
  parsePriceChangeFeedJsonl,
  seedFeedFromHistory,
  serializePriceChangeFeedEntryJsonl,
  serializePriceChangeFeedHeaderJsonl,
  validatePriceChangeFeedEntries,
  PRICE_CHANGE_FEED_JSONL_PATH,
  type PriceChangeFeedEntry,
  type PriceChangeFeedInput,
} from '../../src/engine/pricing/sync/priceChangeFeed';
import {
  parseHistoryJsonl,
  type MasterPriceHistoryEntry,
} from '../../src/engine/pricing/admin/masterPriceHistory';
import { MASTER_PRICE_VERSION } from '../../src/data/priceDatabase2026/types';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..');
const REPORTS_DIR = path.join(ROOT, 'data', 'price2026', 'reports');
const DEFAULT_TRAIL_PATH = path.join(ROOT, PRICE_CHANGE_FEED_JSONL_PATH);
const HISTORY_TRAIL_PATH = path.join(REPORTS_DIR, 'master_price_history.jsonl');

interface FeedCliOptions {
  fromFile: string | null;
  trailPath: string;
}

function parseArgs(argv: string[]): FeedCliOptions {
  let fromFile: string | null = null;
  let trailPath = DEFAULT_TRAIL_PATH;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--from') {
      const value = argv[i + 1];
      if (value === undefined || value === '') throw new Error('--from requires a file path');
      fromFile = value;
      i++;
    } else if (arg === '--trail') {
      const value = argv[i + 1];
      if (value === undefined || value === '') throw new Error('--trail requires a file path');
      trailPath = path.isAbsolute(value) ? value : path.join(process.cwd(), value);
      i++;
    } else {
      throw new Error(`Unknown argument: ${arg} (expected --from <file.json>, --trail <path>)`);
    }
  }
  return { fromFile, trailPath };
}

function readHistoryEntries(): MasterPriceHistoryEntry[] {
  if (!fs.existsSync(HISTORY_TRAIL_PATH)) return [];
  const parsed = parseHistoryJsonl(fs.readFileSync(HISTORY_TRAIL_PATH, 'utf8'));
  if (parsed.errors.length > 0) {
    throw new Error(
      `Refusing to seed: the §4.4 history trail has ${parsed.errors.length} parse error(s): ${parsed.errors.join('; ')}`,
    );
  }
  return parsed.entries;
}

function readInputEntries(fromFile: string): PriceChangeFeedInput[] {
  const resolved = path.isAbsolute(fromFile) ? fromFile : path.join(process.cwd(), fromFile);
  if (!fs.existsSync(resolved)) throw new Error(`Input file not found: ${fromFile}`);
  const parsed: unknown = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  if (!Array.isArray(parsed)) {
    throw new Error(`Input file must contain a JSON array of feed entries, got ${typeof parsed}`);
  }
  const inputs: PriceChangeFeedInput[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const item: unknown = parsed[i];
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new Error(`Input entry[${i}] is not a JSON object`);
    }
    inputs.push(item as PriceChangeFeedInput);
  }
  return inputs;
}

function main(): void {
  const opts = parseArgs(process.argv.slice(2));
  const now = new Date().toISOString();
  const trailDisplay = path.relative(process.cwd(), opts.trailPath) || opts.trailPath;

  if (!fs.existsSync(opts.trailPath)) {
    fs.mkdirSync(path.dirname(opts.trailPath), { recursive: true });
    const history = readHistoryEntries();
    const seed = seedFeedFromHistory(history, now, MASTER_PRICE_VERSION);
    const header = buildPriceChangeFeedJsonlHeader(now, MASTER_PRICE_VERSION);
    const lines = [
      serializePriceChangeFeedHeaderJsonl(header),
      ...seed.entries.map((e) => serializePriceChangeFeedEntryJsonl(e)),
    ];
    fs.writeFileSync(opts.trailPath, `${lines.join('\n')}\n`, 'utf8');
    console.log(
      `Created: ${trailDisplay} (HEADER + ${seed.entries.length} seed entr${seed.entries.length === 1 ? 'y' : 'ies'}; ` +
        `${seed.skipped.length} histor${seed.skipped.length === 1 ? 'y entry' : 'y entries'} skipped — no resourceCode to seed from)`,
    );
    if (opts.fromFile === null) return;
    // Fall through to the append path below (the trail now exists).
  }

  const existing = fs.readFileSync(opts.trailPath, 'utf8');
  const parsed = parsePriceChangeFeedJsonl(existing);
  if (parsed.errors.length > 0) {
    throw new Error(
      `Refusing to append: existing trail has ${parsed.errors.length} parse error(s): ${parsed.errors.join('; ')}`,
    );
  }
  const validation = validatePriceChangeFeedEntries(parsed.entries);
  if (!validation.valid) {
    throw new Error(`Refusing to append: existing trail failed validation: ${validation.errors.join('; ')}`);
  }

  if (opts.fromFile === null) {
    const latest = parsed.entries[parsed.entries.length - 1] as PriceChangeFeedEntry | undefined;
    console.log(
      `${trailDisplay}: ${parsed.entries.length} entr${parsed.entries.length === 1 ? 'y' : 'ies'}` +
        (latest ? ` (latest: ${latest.id} ${latest.resourceCode} ${latest.oldPrice ?? 'null'} → ${latest.newPrice ?? 'null'} @ ${latest.changedAt})` : ' (empty)') +
        ' — no entries appended (pass --from <file.json> to append).',
    );
    return;
  }

  const inputs = readInputEntries(opts.fromFile);
  if (inputs.length === 0) {
    console.log('Input file holds 0 entries — nothing to append.');
    return;
  }
  let entries: readonly PriceChangeFeedEntry[] = parsed.entries;
  const appended: PriceChangeFeedEntry[] = [];
  for (const input of inputs) {
    // buildPriceChangeFeedEntry validates (resourceCode, unit, reason,
    // timestamps, amounts) and assigns the deterministic id; the
    // append refuses a duplicate id (idempotent by content hash).
    const entry = buildPriceChangeFeedEntry(input);
    entries = appendPriceChangeFeedEntry(entries, entry);
    appended.push(entry);
  }
  fs.appendFileSync(
    opts.trailPath,
    appended.map((e) => `${serializePriceChangeFeedEntryJsonl(e)}\n`).join(''),
    'utf8',
  );
  console.log(
    `Appended ${appended.length} entr${appended.length === 1 ? 'y' : 'ies'} to ${trailDisplay}: ` +
      appended.map((e) => e.id).join(', '),
  );
}

main();

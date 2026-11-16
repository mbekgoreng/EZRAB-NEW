/**
 * MASTER PRICING §6 (h)+(i) — NEEDS-REVIEW REGISTRY BUILDER.
 *
 * Generates `src/data/priceDatabase2026/needsReviewRegistry.generated.ts`
 * from the §5 curated decisions (`fase5-decisions.json`):
 *
 *   - 43 NEEDS_REVIEW ambiguities  → flag entries, keyed by each candidate
 *     component key (55 keys).
 *   - 29 NEEDS_REVIEW/OPEN conflicts → flag entries, keyed by component
 *     key (29 keys; 2 overlap with ambiguity keys → 84 merged keys
 *     after the labor OJ/jam twin expansion).
 *   - Underspecified keys (§6 item i, curated here with §5 evidence):
 *     M241|m + EI734|kg + EI374|kg → REFUSE; M12|kg → FLAG; the generic
 *     name `beton` → REFUSE (name-keyed, any unit).
 *
 * The decisions file lives OUTSIDE the repo (program workspace). The
 * generated file is the self-contained runtime artifact: the resolver
 * never reads the decisions file, only the generated module.
 *
 * Run:
 *   npx tsx scripts/price2026/buildNeedsReviewRegistry.ts \
 *     [--decisions <path/to/fase5-decisions.json>]
 *
 * Default decisions path:
 *   ~/workspace/your_files/EZRAB-MASTER-PRICING-2026-11-16/fase5-decisions.json
 *
 * The generator is deterministic: same input → byte-identical output
 * except the `generatedAt` stamp. It FAILS (exit 1) when the decisions
 * file is absent or its counts drift from the pinned §5 numbers
 * (43 ambiguities / 29 conflicts) — a drift means the §5 register
 * changed and the §6 registry must be re-reviewed, not silently rebuilt.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { looseCode, normalizeUnit, typeFromCodePrefix } from './core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const OUT_PATH = path.join(
  REPO_ROOT,
  'src',
  'data',
  'priceDatabase2026',
  'needsReviewRegistry.generated.ts'
);
const DEFAULT_DECISIONS = path.join(
  process.env.HOME || '~',
  'workspace',
  'your_files',
  'EZRAB-MASTER-PRICING-2026-11-16',
  'fase5-decisions.json'
);

// Pinned §5 counts — the generator refuses to run when these drift.
const PINNED_AMBIGUITY_NEEDS_REVIEW = 43;
const PINNED_CONFLICT_NEEDS_REVIEW = 29;

interface RegistryEntry {
  componentKey: string;
  kind: 'AMBIGUITY' | 'CONFLICT' | 'AMBIGUITY_AND_CONFLICT';
  reason: string;
  alternatives: string[];
}

interface UnderspecifiedEntry {
  key: string;
  /** 'KEY' = looseCode|unit component key; 'NAME' = normalized name (any unit). */
  keyKind: 'KEY' | 'NAME';
  action: 'REFUSE' | 'FLAG';
  reason: string;
  alternatives: string[];
}

/**
 * §6 (i) — underspecified keys, curated with §5 evidence. These are
 * DECISIONS, not derived data: each entry cites its §5 evidence inline.
 * A key lands here only when §5 proved the key conflates several
 * specifications with materially different prices.
 */
const UNDERSPECIFIED: UnderspecifiedEntry[] = [
  {
    key: 'M241|m',
    keyKind: 'KEY',
    action: 'REFUSE',
    reason:
      'Pipa Baja (no diameter): 36 CK prices Rp520.000–Rp3.355.000 (all diameters) + HSD Rp180.000 + BM dead-file Rp400.000. One key, many pipes — no single price represents it. Needs split by diameter (owner decision, §5 §7.11).',
    alternatives: ['CK: Rp520.000–Rp3.355.000 (36 prices)', 'HSD: Rp180.000', 'BM dead file: Rp400.000'],
  },
  {
    key: 'EI734|kg',
    keyKind: 'KEY',
    action: 'REFUSE',
    reason:
      'Two keys, one name: EI734|kg and EI374|kg both name-match HSD M39b "Baja Tulangan" Rp16.000 (NAME_UNIT). Neither key has a code-bound price; the Rp16.000 belongs to M39b. Binding either key to it is a silent cross-key guess (§5 §7.9 runtime probe).',
    alternatives: ['HSD M39b Baja Tulangan: Rp16.000 (name match — NOT a code binding)', 'EI374|kg: same name, same price — indistinguishable'],
  },
  {
    key: 'EI374|kg',
    keyKind: 'KEY',
    action: 'REFUSE',
    reason:
      'Two keys, one name: EI374|kg and EI734|kg both name-match HSD M39b "Baja Tulangan" Rp16.000 (NAME_UNIT). Neither key has a code-bound price; the Rp16.000 belongs to M39b. Binding either key to it is a silent cross-key guess (§5 §7.9 runtime probe).',
    alternatives: ['HSD M39b Baja Tulangan: Rp16.000 (name match — NOT a code binding)', 'EI734|kg: same name, same price — indistinguishable'],
  },
  {
    key: 'M12|kg',
    keyKind: 'KEY',
    action: 'FLAG',
    reason:
      'Semen: CK Rp1.300–Rp16.100 (PC/PCC/white/specialty) vs HSD Rp1.600–Rp6.500 vs BM Rp1.600. Underspecified key — needs split by cement type (§5 §7.11). The price is RETURNED with this explicit flag (not refused): the key serves 214 component rows, and the resolved BM Rp1.600 is the documented Portland-cement price for the modal case. Outright refusal would unprice cement catalog-wide; §6 (i) explicitly permits the explicit-ambiguity alternative.',
    alternatives: ['CK: Rp1.300–Rp16.100 (PC/PCC/white/specialty)', 'HSD: Rp1.600–Rp6.500', 'BM: Rp1.600 (resolved)'],
  },
  {
    key: 'beton',
    keyKind: 'NAME',
    action: 'REFUSE',
    reason:
      'Generic name "Beton" without strength class (K-225/K-300/…). The single CK record "Beton" @Rp825.000/m³ cannot represent all classes; a name-only binding to it is a silent guess. Specified names (e.g. "Beton K-225") are unaffected — only the exact generic name is refused.',
    alternatives: ['CK "Beton": Rp825.000/m³ (no strength class stated)'],
  },
];

function esc(s: string): string {
  return JSON.stringify(s);
}

function normalizeKey(key: string): string {
  const [code, unit] = String(key).split('|');
  return `${looseCode(code || '')}|${normalizeUnit(unit || '')}`;
}

/** Labor OJ/jam twin: the resolver answers labor `jam` as `OJ` outside BM
 *  (normalizeUnitForType) and indexes BM labor `jam` also as `OJ` (twin
 *  rule), so a labor flag keyed `L01|OJ` must also fire for `L01|jam`
 *  and vice versa. Equipment `jam` is never twinned. */
function twinKeys(key: string): string[] {
  const [code, unit] = key.split('|');
  if (typeFromCodePrefix(looseCode(code || '')) !== 'LABOR') return [key];
  if (unit === 'OJ') return [key, `${code}|jam`];
  if (unit === 'jam') return [key, `${code}|OJ`];
  return [key];
}

function main(): void {
  const args = process.argv.slice(2);
  const flagIdx = args.indexOf('--decisions');
  const decisionsPath = flagIdx >= 0 && args[flagIdx + 1] ? args[flagIdx + 1] : DEFAULT_DECISIONS;
  if (!fs.existsSync(decisionsPath)) {
    console.error(`[needs-review-registry] decisions file not found: ${decisionsPath}`);
    console.error('  Pass --decisions <path/to/fase5-decisions.json>. Refusing to generate from nothing.');
    process.exit(1);
  }
  const decisions = JSON.parse(fs.readFileSync(decisionsPath, 'utf8'));

  const ambItems: any[] = (decisions.ambiguities?.items || []).filter(
    (i: any) => i.verdict === 'NEEDS_REVIEW'
  );
  const confItems: any[] = (decisions.conflicts?.items || []).filter(
    (i: any) => i.verdict === 'NEEDS_REVIEW' || i.verdict === 'OPEN'
  );
  if (ambItems.length !== PINNED_AMBIGUITY_NEEDS_REVIEW) {
    console.error(
      `[needs-review-registry] ambiguity NEEDS_REVIEW count drifted: got ${ambItems.length}, pinned ${PINNED_AMBIGUITY_NEEDS_REVIEW}. Re-review §5 before regenerating.`
    );
    process.exit(1);
  }
  if (confItems.length !== PINNED_CONFLICT_NEEDS_REVIEW) {
    console.error(
      `[needs-review-registry] conflict NEEDS_REVIEW/OPEN count drifted: got ${confItems.length}, pinned ${PINNED_CONFLICT_NEEDS_REVIEW}. Re-review §5 before regenerating.`
    );
    process.exit(1);
  }

  const byKey = new Map<string, RegistryEntry>();
  const merge = (key: string, kind: 'AMBIGUITY' | 'CONFLICT', reason: string, alternatives: string[]) => {
    for (const k of twinKeys(normalizeKey(key))) {
      const prev = byKey.get(k);
      if (!prev) {
        byKey.set(k, { componentKey: k, kind, reason, alternatives: [...new Set(alternatives)] });
      } else {
        prev.kind =
          prev.kind === kind ? kind : 'AMBIGUITY_AND_CONFLICT';
        if (!prev.reason.includes(reason)) prev.reason = `${prev.reason} ‖ ${reason}`;
        for (const a of alternatives) if (!prev.alternatives.includes(a)) prev.alternatives.push(a);
      }
    }
  };

  for (const item of ambItems) {
    const keys: string[] = [...(item.candidates || [])];
    if (item.key) keys.push(item.key);
    const rowLabel = `${item.rowId || '?'} ${JSON.stringify(item.rowName || '')} @${item.unit || ''} Rp${item.price ?? '?'}`;
    for (const k of keys) {
      const others = keys.filter((x) => x !== k);
      merge(
        k,
        'AMBIGUITY',
        item.reason || 'NEEDS_REVIEW (no reason recorded in §5).',
        [...others.map((o) => `competing key ${o}`), `source row ${rowLabel}`]
      );
    }
  }

  for (const item of confItems) {
    const sources = item.sources || {};
    const alts: string[] = Object.entries(sources).map(
      ([src, prices]) => `${src}: ${(prices as number[]).map((p) => `Rp${p.toLocaleString('id-ID')}`).join(', ')}`
    );
    alts.push(
      `spread Rp${Number(item.min).toLocaleString('id-ID')}–Rp${Number(item.max).toLocaleString('id-ID')} (×${item.ratio})`
    );
    merge(item.key, 'CONFLICT', item.evidence || 'NEEDS_REVIEW (no evidence recorded in §5).', alts);
  }

  const entries = [...byKey.values()].sort((a, b) => a.componentKey.localeCompare(b.componentKey));
  const kindCounts = {
    AMBIGUITY: entries.filter((e) => e.kind === 'AMBIGUITY').length,
    CONFLICT: entries.filter((e) => e.kind === 'CONFLICT').length,
    AMBIGUITY_AND_CONFLICT: entries.filter((e) => e.kind === 'AMBIGUITY_AND_CONFLICT').length,
  };

  const header = `/**
 * EZRAB — NEEDS-REVIEW + UNDERSPECIFIED-KEY REGISTRY (MASTER PRICING §6)
 * ======================================================================
 *
 * GENERATED — do not edit by hand. Regenerate with:
 *   npx tsx scripts/price2026/buildNeedsReviewRegistry.ts
 *
 * Source: fase5-decisions.json (§5 curated decisions, 2026-11-16).
 *   - ${PINNED_AMBIGUITY_NEEDS_REVIEW} NEEDS_REVIEW ambiguities + ${PINNED_CONFLICT_NEEDS_REVIEW} NEEDS_REVIEW/OPEN conflicts
 *     merged into ${entries.length} flagged component keys (${kindCounts.AMBIGUITY} ambiguity-only, ${kindCounts.CONFLICT} conflict-only,
 *     ${kindCounts.AMBIGUITY_AND_CONFLICT} both). Labor OJ/jam twin keys are emitted for
 *     both forms (see buildNeedsReviewRegistry.ts).
 *   - ${UNDERSPECIFIED.length} underspecified keys (§6 item i, curated with §5 evidence):
 *     M241|m + EI734|kg + EI374|kg → REFUSE; M12|kg → FLAG; name "beton" → REFUSE.
 *
 * A flagged key still resolves (the flag marks the resolution, it does
 * not block it) — except REFUSE underspecified keys, which the resolver
 * declines to bind to a single price. Nothing here changes a price: the
 * registry only attaches evidence to resolutions that already exist.
 *
 * Generated: ${new Date().toISOString()}
 * Decisions file: ${decisionsPath}
 */

export interface NeedsReviewRegistryEntry {
  componentKey: string;
  kind: 'AMBIGUITY' | 'CONFLICT' | 'AMBIGUITY_AND_CONFLICT';
  reason: string;
  alternatives: string[];
}

export interface UnderspecifiedRegistryEntry {
  key: string;
  keyKind: 'KEY' | 'NAME';
  action: 'REFUSE' | 'FLAG';
  reason: string;
  alternatives: string[];
}

export const NEEDS_REVIEW_REGISTRY_STATS = {
  ambiguityItems: ${PINNED_AMBIGUITY_NEEDS_REVIEW},
  conflictItems: ${PINNED_CONFLICT_NEEDS_REVIEW},
  flaggedKeys: ${entries.length},
  ambiguityOnlyKeys: ${kindCounts.AMBIGUITY},
  conflictOnlyKeys: ${kindCounts.CONFLICT},
  bothKeys: ${kindCounts.AMBIGUITY_AND_CONFLICT},
  underspecifiedEntries: ${UNDERSPECIFIED.length},
} as const;

export const NEEDS_REVIEW_ENTRIES: NeedsReviewRegistryEntry[] = [
${entries
  .map(
    (e) =>
      `  { componentKey: ${esc(e.componentKey)}, kind: ${esc(e.kind)}, reason: ${esc(e.reason)}, alternatives: [${e.alternatives.map(esc).join(', ')}] },`
  )
  .join('\n')}
];

export const NEEDS_REVIEW_BY_KEY: Readonly<Record<string, NeedsReviewRegistryEntry>> = {
${entries.map((e, i) => `  ${esc(e.componentKey)}: NEEDS_REVIEW_ENTRIES[${i}],`).join('\n')}
};

export const UNDERSPECIFIED_ENTRIES: UnderspecifiedRegistryEntry[] = [
${UNDERSPECIFIED.map(
  (e) =>
    `  { key: ${esc(e.key)}, keyKind: ${esc(e.keyKind)}, action: ${esc(e.action)}, reason: ${esc(e.reason)}, alternatives: [${e.alternatives.map(esc).join(', ')}] },`
).join('\n')}
];
`;

  fs.writeFileSync(OUT_PATH, header, 'utf8');
  console.log(`[needs-review-registry] wrote ${OUT_PATH}`);
  console.log(
    `  ${ambItems.length} ambiguities + ${confItems.length} conflicts → ${entries.length} flagged keys ` +
      `(ambiguity-only ${kindCounts.AMBIGUITY}, conflict-only ${kindCounts.CONFLICT}, both ${kindCounts.AMBIGUITY_AND_CONFLICT})`
  );
  console.log(`  underspecified entries: ${UNDERSPECIFIED.length}`);
}

main();

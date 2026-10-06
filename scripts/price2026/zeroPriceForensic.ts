/**
 * EZRAB PRICE 2026 — PHASE 42/43: ZERO-PRICE & SILENT-FALLBACK FORENSIC
 * ====================================================================
 *
 * Walks the repository looking for the exact patterns that caused AHSP to display
 * "Rp 0": a missing price coerced to zero, and magic constants standing in for a real
 * price. It then re-checks the live price path to prove the fix actually holds.
 *
 * Two parts:
 *   A. STATIC  — regex sweep of src/ and server/ for zero-coercion and magic constants.
 *   B. DYNAMIC — call the resolver for a priced and an unpriced resource and prove the
 *                unpriced one is NULL (never 0).
 *
 * Run: npm run price:forensic
 */

import * as fs from 'fs';
import * as path from 'path';
import { priceResolver2026 } from '../../src/data/priceDatabase2026/resolver';
import { RESOURCE_PRICE_RECORDS } from '../../src/data/priceDatabase2026/priceMaster.generated';
import { FABRICATED_PRICE_SITES } from '../../src/engine/pricing/telemetry/fabricatedPriceTelemetry';

const ROOT = process.cwd();
const REPORT_DIR = path.join(ROOT, 'data', 'price2026', 'reports');

const SCAN_DIRS = ['src', 'server'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'dist-qa', '.git', 'backups', 'generated']);

/** Files that legitimately mention these patterns (the audit itself, generated data). */
const SKIP_FILE_RE = /(\.generated\.ts$|\.test\.ts$|fabricatedPriceTelemetry\.ts$|zeroPriceForensic\.ts$|assertPrices\.ts$)/;

/**
 * Data modules legitimately CONTAIN price values (Rp 150.000 is a real price there, not
 * a fallback). The magic-constant pattern is therefore not applied to them.
 */
const DATA_FILE_RE = /^src\/(?:data\/|domain\/[a-z]+\/.*(?:MasterData|masterData|Seed|seed))/;

interface Finding {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  pattern: string;
  file: string;
  line: number;
  snippet: string;
  note: string;
}

const PATTERNS: Array<{ re: RegExp; severity: Finding['severity']; note: string; skipData?: boolean }> = [
  {
    re: /(?:unitPrice|price|harga|rate)\s*(?:\|\||\?\?)\s*0\b/i,
    severity: 'CRITICAL',
    note: 'A missing price is coerced to 0 — the exact defect that produced "Rp 0".',
  },
  {
    re: /(?:unitPrice|price)\s*:\s*0\s*[,}]/,
    severity: 'CRITICAL',
    note: 'A price field is returned as a literal 0 instead of null.',
  },
  {
    re: /\b(?:50000|45000|74000|120000|150000|1150000)\b/,
    severity: 'HIGH',
    note: 'Known fabricated price constant from the Phase 0 audit.',
    skipData: true,
  },
  {
    re: /fallbackPrice|defaultPrice|estimatedPrice\s*=/,
    severity: 'HIGH',
    note: 'A local "fallback price" variable — a price invented when data is missing.',
  },
  {
    re: /\.price\s*>\s*0\s*\?\s*[^:]+:\s*0/,
    severity: 'MEDIUM',
    note: 'Ternary that turns a missing price into 0.',
  },
];

function walk(dir: string, out: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(e.name)) {
      out.push(full);
    }
  }
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function readIfExists(p: string): string {
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
}

function staticScan(): Finding[] {
  const files: string[] = [];
  for (const d of SCAN_DIRS) walk(path.join(ROOT, d), files);

  const findings: Finding[] = [];
  for (const f of files) {
    const rel = path.relative(ROOT, f).replace(/\\/g, '/');
    if (SKIP_FILE_RE.test(rel)) continue;
    const isDataFile = DATA_FILE_RE.test(rel);
    const raw = fs.readFileSync(f, 'utf8');
    const src = stripComments(raw);
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const p of PATTERNS) {
        if (p.skipData && isDataFile) continue;
        if (p.re.test(line)) {
          findings.push({
            severity: p.severity,
            pattern: p.re.source,
            file: rel,
            line: i + 1,
            snippet: line.trim().slice(0, 160),
            note: p.note,
          });
        }
      }
    }
  }
  return findings;
}

function main(): void {
  fs.mkdirSync(REPORT_DIR, { recursive: true });

  console.log('=== PHASE 42/43 — ZERO-PRICE & SILENT-FALLBACK FORENSIC ===');
  console.log('');

  // -------------------------------------------------------------------------
  console.log('--- A. STATIC SWEEP ---');
  const findings = staticScan();
  const bySeverity = { CRITICAL: 0, HIGH: 0, MEDIUM: 0 };
  for (const f of findings) bySeverity[f.severity]++;

  console.log(`  CRITICAL ${bySeverity.CRITICAL}   HIGH ${bySeverity.HIGH}   MEDIUM ${bySeverity.MEDIUM}`);
  const critical = findings.filter((f) => f.severity === 'CRITICAL');
  for (const f of critical.slice(0, 25)) {
    console.log(`  [${f.severity}] ${f.file}:${f.line}  ${f.snippet}`);
  }

  // -------------------------------------------------------------------------
  console.log('');
  console.log('--- B. REGISTERED FABRICATED SITES (Phase 0 audit registry) ---');
  // The registry is a HISTORICAL record (line numbers are as-audited). Rather than
  // rewrite history, we check whether each constant is still present in the file TODAY.
  const registered = FABRICATED_PRICE_SITES.map((s) => {
    const p = path.join(ROOT, s.file);
    const src = stripComments(readIfExists(p));
    const stillPresent = s.constant > 0 && new RegExp(`\\b${s.constant}\\b`).test(src);
    return {
      id: s.id,
      constant: s.constant,
      severity: s.severity,
      file: s.file,
      line: s.line,
      note: s.note,
      stillPresent,
    };
  });
  const resolvedCount = registered.filter((s) => !s.stillPresent).length;
  console.log(`  registered sites: ${registered.length}   constants no longer present: ${resolvedCount}`);
  for (const s of registered) {
    const tag = s.stillPresent ? 'STILL PRESENT' : 'RESOLVED';
    console.log(`  [${tag}] ${s.id} = Rp ${s.constant.toLocaleString('id-ID')}  (${s.file})`);
  }

  // -------------------------------------------------------------------------
  console.log('');
  console.log('--- C. DYNAMIC PROOF: the live price path ---');
  const priced = RESOURCE_PRICE_RECORDS[0];
  const pricedRes = priced
    ? priceResolver2026.resolveResourcePrice({
        resourceCode: priced.resourceCode,
        unit: priced.unit,
        resourceType: priced.resourceType,
      })
    : null;
  const unpricedRes = priceResolver2026.resolveResourcePrice({
    resourceCode: 'ZZ.NOT.A.REAL.CODE',
    unit: 'kg',
    resourceType: 'material',
  });

  console.log(
    `  priced   ${priced?.resourceCode} @ ${priced?.unit} -> price=${pricedRes?.price} status=${pricedRes?.status}`
  );
  console.log(
    `  unpriced ZZ.NOT.A.REAL.CODE @ kg -> price=${JSON.stringify(unpricedRes.price)} status=${unpricedRes.status}`
  );

  const dynamicProof = {
    pricedReturnsNumber: typeof pricedRes?.price === 'number' && (pricedRes?.price ?? 0) > 0,
    unpricedReturnsNull: unpricedRes.price === null,
    unpricedIsNotZero: unpricedRes.price !== 0,
  };
  console.log(`  priced returns a positive number : ${dynamicProof.pricedReturnsNumber}`);
  console.log(`  unpriced returns NULL            : ${dynamicProof.unpricedReturnsNull}`);
  console.log(`  unpriced is NOT 0                : ${dynamicProof.unpricedIsNotZero}`);

  const report = {
    generatedAt: new Date().toISOString(),
    static: {
      totals: bySeverity,
      findings,
    },
    registeredFabricatedSites: registered,
    registeredSitesResolved: registered.filter((s) => !s.stillPresent).length,
    dynamicProof,
    verdict:
      bySeverity.CRITICAL === 0 && dynamicProof.unpricedReturnsNull
        ? 'PASS — no zero-coercion found in the price path; unpriced resources resolve to NULL.'
        : 'ATTENTION — see findings above.',
  };

  fs.writeFileSync(path.join(REPORT_DIR, 'zero_price_forensic.json'), JSON.stringify(report, null, 2));
  console.log('');
  console.log('VERDICT:', report.verdict);
  console.log('Wrote: data/price2026/reports/zero_price_forensic.json');
}

main();

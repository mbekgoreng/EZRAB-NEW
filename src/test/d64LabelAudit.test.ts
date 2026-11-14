/**
 * D-64 (P2) — Internal Bowplank ID labeled "AHSP resmi": NOT REPRODUCED.
 * `AHSP.VOL.BOWPLANK.001` and the "Diklaim resmi" wording exist nowhere in
 * HEAD (verified 2026-11-14 across src/data/scripts/server/demo-gen,
 * including generated files and the AHSP master JSON).
 * Run: npx tsx src/test/d64LabelAudit.test.ts
 *
 * Regression: the audit is encoded as a test — the internal ID must never
 * appear, and no calculator surface may label an internal ID "AHSP resmi".
 * A live-DOM re-check remains for a later browser-regression phase (OD-13).
 *
 * ADJACENT FINDING (recorded, NOT fixed here — P-11 family, needs source
 * evidence, OD-02 family): the 24 calculator `defaultAhspCode` values use
 * a LEGACY code scheme with 0 matches in the 2026 canonical catalog
 * (canonical SDA uses `A.2.01.b1.1`-style codes; "bowplank" appears
 * NOWHERE in the canonical catalog). This contradicts the repro doc's
 * claim that A.2.2.1.4 is "a real canonical code". See
 * 04-REPAIR-EXECUTION-LOG.md (Batch B) and report 09.
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

let failures = 0;
let passes = 0;
const test = (name: string, fn: () => void) => {
  try { fn(); passes++; console.log(`✓ ${name}`); }
  catch (e: any) { failures++; console.error(`✗ ${name}: ${e.message}`); }
};
const eq = (a: unknown, b: unknown, m: string) => { if (a !== b) throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (c: boolean, m: string) => { if (!c) throw new Error(m); };

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const selfFile = fileURLToPath(import.meta.url);

// The forbidden internal-ID strings, built dynamically so this file's own
// source does not trip the scan (it is also excluded by path).
const FORBIDDEN = [
  ['AHSP', 'VOL', 'BOWPLANK', '001'].join('.'),
  ['VOL', 'BOWPLANK'].join('.'),
  ['BOWPLANK', '001'].join('.'),
  'Diklaim resmi',
];

function walkTextFiles(dir: string, out: string[]): void {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkTextFiles(full, out);
    else if (/\.(ts|tsx|js|jsx|json|md|mts|cts)$/.test(entry.name)) out.push(full);
  }
}

test('internal Bowplank ID appears NOWHERE in src (incl. generated files)', () => {
  const files: string[] = [];
  walkTextFiles(path.join(repoRoot, 'src'), files);
  const hits: string[] = [];
  for (const f of files) {
    if (path.resolve(f) === path.resolve(selfFile)) continue;
    const text = fs.readFileSync(f, 'utf8');
    for (const needle of FORBIDDEN) {
      if (text.includes(needle)) hits.push(`${path.relative(repoRoot, f)}: ${needle}`);
    }
  }
  eq(hits.length, 0, `internal Bowplank ID / "Diklaim resmi" must not appear: ${hits.slice(0, 5).join('; ')}`);
});

test('internal Bowplank ID appears NOWHERE in the AHSP master JSON', () => {
  const master = path.join(repoRoot, 'data', 'ahsp2026', 'validated', 'ahsp_2026_master.json');
  ok(fs.existsSync(master), 'AHSP master JSON must exist');
  const text = fs.readFileSync(master, 'utf8');
  for (const needle of FORBIDDEN) {
    ok(!text.includes(needle), `master JSON must not contain ${needle}`);
  }
});

test('internal Bowplank ID appears NOWHERE in scripts/server/demo-gen', () => {
  const files: string[] = [];
  for (const dir of ['scripts', 'server', 'demo-gen']) walkTextFiles(path.join(repoRoot, dir), files);
  const hits: string[] = [];
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    for (const needle of FORBIDDEN) {
      if (text.includes(needle)) hits.push(`${path.relative(repoRoot, f)}: ${needle}`);
    }
  }
  eq(hits.length, 0, `internal Bowplank ID must not appear: ${hits.slice(0, 5).join('; ')}`);
});

test('no calculator surface labels an internal ID "AHSP resmi"', () => {
  const surfaces = [
    path.join('src', 'components', 'qto', 'QtoCalculatorView.tsx'),
    path.join('src', 'components', 'qto', 'QtoRekapVolumeView.tsx'),
    path.join('src', 'components', 'workItems', 'DaftarPekerjaanView.tsx'),
    path.join('src', 'components', 'qto', 'SmartAddWorkItemModal.tsx'),
    path.join('src', 'components', 'qto', 'WeirCostSummaryPanel.tsx'),
  ];
  const internalIdPattern = /(VOL\.|AHSP\.VOL|INTERNAL[-_ ]ID)/;
  for (const rel of surfaces) {
    const full = path.join(repoRoot, rel);
    if (!fs.existsSync(full)) continue;
    const lines = fs.readFileSync(full, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (line.includes('AHSP resmi')) {
        ok(!internalIdPattern.test(line),
          `${rel}:${i + 1}: an "AHSP resmi" line must not mention an internal ID: ${line.trim().slice(0, 120)}`);
      }
    });
  }
});

test('weir banner labels the registry honestly (Bina Marga, Lampiran V)', () => {
  const view = fs.readFileSync(path.join(repoRoot, 'src', 'components', 'qto', 'QtoCalculatorView.tsx'), 'utf8');
  ok(view.includes('AHSP resmi Bina Marga 2026'), 'banner must name the Bina Marga registry');
  ok(view.includes('Lampiran V SE DJBK No. 47/SE/Dk/2026'), 'banner must cite the source document');
});

// --- summary ----------------------------------------------------------------

console.log(`\nD-64: ${passes} passed, ${failures} failed.`);
process.exit(failures ? 1 : 0);

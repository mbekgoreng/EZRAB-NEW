/**
 * EZRAB — CONSTRUCTION AI SCENARIO REGRESSION SUITE (364 skenario)
 *
 * Dataset: src/test/constructionScenarios.json (file terpisah, dapat
 * dipelihara/diperluas tanpa menyentuh runner). Lapisan yang diuji:
 * PARSER DETERMINISTIK + TIPOLOGI + WORKFLOW (buildUniversalDraft) —
 * BUKAN tes model live dan BUKAN tes mocked-LLM; jangan menyajikan
 * hasilnya sebagai bukti perilaku model live. Tes live: BELUM
 * DIJALANKAN (tidak ada kunci di lingkungan ini).
 *
 * Hasil per skenario: PASS / FAIL / BLOCKED (build melempar) /
 * NOT SUPPORTED (workflow harapan memang belum didukung — hanya
 * dihitung lulus bila ekspektasi menyatakannya).
 *
 * Jalankan: npx --yes tsx src/test/constructionAiScenarios.test.ts
 * Ringkasan JSON ditulis ke /tmp/construction-scenario-results.json
 * untuk dipakai dokumen hasil audit.
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const storage: Record<string, string> = {};
(global as any).window = {
  localStorage: {
    getItem: (key: string) => storage[key] || null,
    setItem: (key: string, val: string) => { storage[key] = val; },
    removeItem: (key: string) => { delete storage[key]; },
    clear: () => { Object.keys(storage).forEach((k) => delete storage[k]); },
  },
};

import { understandProject, assessBuildingMissingInfo } from '../ai-tools/ezrab-ai/buildingTypology';
import { buildUniversalDraft, detectScopes } from '../ai-tools/ezrab-ai/universalRab';

interface ScenarioExpect {
  function?: string;
  scopes?: string[];
  footprint?: number | null;
  buildingArea?: number;
  land?: number;
  floors?: number;
  floorsSource?: 'explicit' | 'assumption';
  notMultistory?: boolean;
  build?: 'draft' | 'needs-spec' | 'unsupported' | 'any';
  clarify?: boolean;
  missingOnlyMeasure?: boolean;
}
interface Scenario {
  id: string;
  input?: string;
  turns?: string[];
  expect: ScenarioExpect;
}

const here = dirname(fileURLToPath(import.meta.url));
const dataset = JSON.parse(readFileSync(join(here, 'constructionScenarios.json'), 'utf8')) as {
  groups: Record<string, Scenario[]>;
};

type Verdict = 'PASS' | 'FAIL' | 'BLOCKED' | 'NOT SUPPORTED';
interface Row { id: string; group: string; verdict: Verdict; problems: string[] }

const rows: Row[] = [];
const nearly = (a: number | null | undefined, b: number, tol = 0.6) => a != null && Math.abs(a - b) <= tol;

function evaluate(group: string, sc: Scenario) {
  const problems: string[] = [];
  const e = sc.expect;
  const text = sc.turns ? sc.turns.join(' ') : (sc.input ?? '');
  try {
    const u = understandProject(text);
    if (e.function !== undefined && u.functionId !== e.function) problems.push(`function=${u.functionId}≠${e.function}`);
    if (e.footprint !== undefined) {
      if (e.footprint === null) { if (u.footprint.value !== null) problems.push(`footprint=${u.footprint.value}≠null`); }
      else if (!nearly(u.footprint.value, e.footprint)) problems.push(`footprint=${u.footprint.value}≠${e.footprint}`);
    }
    if (e.buildingArea !== undefined) {
      if (e.buildingArea === null) { if (u.statedBuildingArea.value !== null) problems.push(`buildingArea=${u.statedBuildingArea.value}≠null`); }
      else if (!nearly(u.statedBuildingArea.value, e.buildingArea)) problems.push(`buildingArea=${u.statedBuildingArea.value}≠${e.buildingArea}`);
    }
    if (e.land !== undefined) {
      if (e.land === null) { if (u.landArea.value !== null) problems.push(`land=${u.landArea.value}≠null`); }
      else if (!nearly(u.landArea.value, e.land)) problems.push(`land=${u.landArea.value}≠${e.land}`);
    }
    if (e.floors !== undefined && u.floors.value !== e.floors) problems.push(`floors=${u.floors.value}≠${e.floors}`);
    if (e.floorsSource !== undefined && u.floors.source !== e.floorsSource) problems.push(`floorsSource=${u.floors.source}≠${e.floorsSource}`);
    if (e.notMultistory && u.complexity === 'bertingkat') problems.push('kompleksitas=bertingkat (dilarang)');
    if (e.scopes) {
      const got = detectScopes(text).map((s) => s.id);
      for (const want of e.scopes) if (!got.includes(want)) problems.push(`scope ${want} tidak terdeteksi (dapat: ${got.join(',') || '—'})`);
    }
    if (e.clarify || e.build) {
      const r = buildUniversalDraft(text);
      if (e.build && e.build !== 'any' && r.kind !== e.build) problems.push(`build=${r.kind}≠${e.build}`);
      if (e.clarify) {
        if (r.kind !== 'needs-spec') problems.push(`klarifikasi diharapkan needs-spec, dapat ${r.kind}`);
        else if (/Gedung & Bangunan Bertingkat/.test(r.reason)) problems.push('alasan masih memakai label generik bertingkat');
      }
    }
    if (e.missingOnlyMeasure) {
      const a = assessBuildingMissingInfo(u, text);
      const blockers = a.items.filter((i) => i.blocksDraft);
      if (blockers.some((b) => b.field !== 'measure')) problems.push(`blokir tier A bukan ukuran: ${blockers.map((b) => b.field).join(',')}`);
    }
    const verdict: Verdict = problems.length === 0 ? 'PASS' : 'FAIL';
    rows.push({ id: sc.id, group, verdict, problems });
  } catch (err) {
    rows.push({ id: sc.id, group, verdict: 'BLOCKED', problems: [`exception: ${(err as Error).message}`] });
  }
}

for (const [group, scenarios] of Object.entries(dataset.groups)) {
  for (const sc of scenarios) evaluate(group, sc);
}

const byGroup: Record<string, Record<Verdict, number>> = {};
let totalPass = 0;
for (const r of rows) {
  byGroup[r.group] = byGroup[r.group] ?? { PASS: 0, FAIL: 0, BLOCKED: 0, 'NOT SUPPORTED': 0 };
  byGroup[r.group][r.verdict]++;
  if (r.verdict === 'PASS') totalPass++;
}
for (const r of rows) {
  if (r.verdict !== 'PASS') console.log(`  ${r.verdict} ${r.id} [${r.group}] — ${r.problems.join(' ; ')}`);
}
console.log('\nPer grup:', JSON.stringify(byGroup, null, 1));
console.log(`CONSTRUCTION SCENARIOS: ${totalPass}/${rows.length} PASS, ${rows.length - totalPass} non-PASS`);
writeFileSync('/tmp/construction-scenario-results.json', JSON.stringify({ total: rows.length, pass: totalPass, byGroup, rows }, null, 1));
process.exit(rows.length - totalPass > 0 ? 1 : 0);

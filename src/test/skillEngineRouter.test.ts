/**
 * Skill Engine — Router (BARU, Phase 2 Workstream 3).
 *
 * Suite tsx polos (BUKAN vitest — jalankan: npx tsx src/test/skillEngineRouter.test.ts).
 *
 * Yang dibuktikan:
 *  A. Pemetaan intent -> skill: 14 intent chat perintah, 10 intent Quick
 *     Action; intent bukan milik skill -> null (jalur lama tetap berjalan).
 *  B. Wrapper route(): deteksi diinjeksikan (tanpa impor intentRouter),
 *     needsClarification diteruskan, skill nonaktif -> null.
 *  C. Disambiguasi berbasis confidence: pemenang jelas -> route; dua
 *     kandidat berdekatan -> klarifikasi "A atau B?"; semua rendah -> unknown.
 *  D. Tabel kompatibilitas Copilot: ke-14 kode detectIntent terpetakan /
 *     ditandai kesenjangan; pemetaan mutasi diblokir kanal (jawab-saja).
 *
 * Tanpa provider, tanpa DOM, tanpa impor modul berat.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildToolCatalog,
  createValidatedRegistry,
  SkillRegistry,
  type ToolCatalog,
} from '../ai-tools/skill-engine/skillRegistry';
import { QUICK_ACTION_SKILL_DEFINITIONS } from '../ai-tools/skill-engine/quickActionSkillDefinitions';
import { COMMAND_SKILL_DEFINITIONS } from '../ai-tools/skill-engine/commandSkillDefinitions';
import {
  CHAT_INTENT_TO_SKILL_ID,
  COPILOT_INTENT_MAP,
  QUICK_ACTION_INTENT_TO_SKILL_ID,
  createSkillRouter,
  disambiguate,
  mapIntentToSkillId,
  type DetectIntentFn,
  type DetectResult,
} from '../ai-tools/skill-engine/skillRouter';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) {
    passed++;
    console.log(`✓ ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/* Katalog live diekstrak dari source (pola yang sama dengan suite registry). */
function extractLiveTools(): Array<{
  name: string;
  permission: 'read-only' | 'draft' | 'consequential';
  available: boolean;
}> {
  const toolsSrc = readFileSync(resolve(ROOT, 'src/ai-tools/ezrab-ai/tools.ts'), 'utf8');
  const regSrc = readFileSync(resolve(ROOT, 'src/ai-tools/ezrab-ai/toolRegistry.ts'), 'utf8');
  const out = new Map<string, { name: string; permission: 'read-only' | 'draft' | 'consequential'; available: boolean }>();
  const schemaBlock = regSrc.slice(regSrc.indexOf('CHAT_TOOL_SCHEMAS'));
  for (const m of toolsSrc.matchAll(/name: '([a-z0-9_]+)',/g)) {
    const name = m[1];
    const pm = schemaBlock.match(new RegExp(`${name}: \\{\\s*\\n\\s*permission: '([a-z-]+)'`));
    out.set(name, { name, permission: (pm?.[1] ?? 'read-only') as 'read-only' | 'draft' | 'consequential', available: true });
  }
  for (const m of regSrc.matchAll(/name: '([a-z0-9_]+)',/g)) {
    const name = m[1];
    if (out.has(name)) continue;
    const seg = regSrc.slice(m.index, m.index + 1200);
    const perm = seg.match(/permission: '([a-z-]+)'/)?.[1];
    const avail = seg.match(/available: (true|false)/)?.[1];
    if (perm) out.set(name, { name, permission: perm as 'read-only' | 'draft' | 'consequential', available: avail !== 'false' });
  }
  return [...out.values()];
}

const LIVE_CATALOG: ToolCatalog = buildToolCatalog(extractLiveTools());
const REGISTRY = createValidatedRegistry(
  [...QUICK_ACTION_SKILL_DEFINITIONS, ...COMMAND_SKILL_DEFINITIONS],
  LIVE_CATALOG,
);
const ROUTER = createSkillRouter(REGISTRY);

/* ------------------------------------------------------------------ */
/* A. Pemetaan intent -> skill                                         */
/* ------------------------------------------------------------------ */
console.log('\n[A] Pemetaan intent -> skill');

{
  const expected: Record<string, string> = {
    CREATE_PROJECT: 'create-project',
    DELETE_PROJECT: 'delete-project',
    DELETE_PROJECT_CONFIRM: 'delete-project',
    ARCHIVE_PROJECT: 'archive-project',
    DUPLICATE_PROJECT: 'duplicate-project',
    CREATE_QTO_ITEM: 'create-qto-item',
    SYNC_QTO: 'sync-qto',
    RUN_DED_ANALYSIS: 'run-ded-analysis',
    SUMMARIZE_DOCUMENT: 'summarize-document',
    EXPORT_PROJECT: 'export-project',
    CREATE_REVISION: 'create-revision',
    CREDIT_BALANCE: 'credit-balance',
    TOPUP_CREDIT: 'topup-credit',
    UPDATE_PROJECT_SETTINGS: 'update-project-settings',
  };
  check('peta intent chat = 14 entri (13 skill + langkah konfirmasi)',
    Object.keys(CHAT_INTENT_TO_SKILL_ID).length === 14);
  let allOk = true;
  for (const [intent, skillId] of Object.entries(expected)) {
    if (mapIntentToSkillId(intent, 'chat') !== skillId) {
      allOk = false;
      console.log(`  ✗ pemetaan ${intent} -> ${mapIntentToSkillId(intent, 'chat')} (harap ${skillId})`);
    }
  }
  check('ke-14 intent chat perintah memetakan ke skill yang benar', allOk);
  const nonSkill = ['GREETING', 'HELP', 'OPEN_TEMPLATE', 'OPEN_PROJECTS', 'OPEN_RAB', 'OPEN_QTO',
    'OPEN_AHSP', 'CAPABILITIES', 'CALCULATE', 'QUERY_PROJECT_TOTAL', 'CREATE_RAB_DIRECT',
    'RAB_FULL_AI', 'UNKNOWN', 'GAME_INFO', 'CLARIFY_TOPIC'];
  check('intent bukan milik skill -> null (jalur lama tetap berjalan)',
    nonSkill.every((i) => mapIntentToSkillId(i, 'chat') === null));
  const qaExpected: Record<string, string> = {
    RAB_ANALYSIS: 'audit-rab',
    VOLUME_CALCULATION: 'hitung-volume',
    AHSP_LOOKUP: 'cari-ahsp',
    PRICE_SEARCH: 'cari-harga',
    DED_ANALYSIS: 'analisis-ded',
    REPORT_GENERATION: 'buat-laporan',
    CURVE_S_GENERATION: 'periksa-kurva-s',
    EXPLAIN_CALCULATION: 'jelaskan-item',
    RECALCULATE_RAB: 'recalculate',
    BASIC_HELP: 'bantuan-fitur',
  };
  check('peta intent Quick Action = 10 entri',
    Object.keys(QUICK_ACTION_INTENT_TO_SKILL_ID).length === 10);
  check('ke-10 intent Quick Action memetakan ke skill yang benar',
    Object.entries(qaExpected).every(([intent, skillId]) => mapIntentToSkillId(intent, 'quick-action') === skillId));
  check('semua skillId hasil pemetaan TERDAFTAR di registry',
    [...Object.values(CHAT_INTENT_TO_SKILL_ID), ...Object.values(QUICK_ACTION_INTENT_TO_SKILL_ID)]
      .every((id) => REGISTRY.has(id)));
}

/* ------------------------------------------------------------------ */
/* B. Wrapper route()                                                  */
/* ------------------------------------------------------------------ */
console.log('\n[B] Wrapper route()');

function cannedDetect(result: DetectResult): DetectIntentFn {
  return () => result;
}

{
  const r = ROUTER.route('buat proyek Rumah Impian', cannedDetect({
    intent: 'CREATE_PROJECT', confidence: 0.95, needsClarification: false, param: 'Rumah Impian', localOnly: true,
  }));
  check('route intent perintah -> skill + param diteruskan',
    r.skillId === 'create-project' && r.skill?.id === 'create-project' && r.param === 'Rumah Impian' && r.confidence === 0.95);
  const r2 = ROUTER.route('buka template', cannedDetect({
    intent: 'OPEN_TEMPLATE', confidence: 0.9, needsClarification: false, localOnly: true,
  }));
  check('route intent non-skill -> skillId null (fallback ke jalur lama)',
    r2.skillId === null && r2.skill === null && r2.intent === 'OPEN_TEMPLATE');
  const r3 = ROUTER.route('asdfgh', cannedDetect({
    intent: 'UNKNOWN', confidence: 0, needsClarification: true,
    clarificationPrompt: 'Tidak mengerti.', localOnly: true,
  }));
  check('route UNKNOWN + needsClarification diteruskan apa adanya',
    r3.skillId === null && r3.needsClarification === true && r3.clarificationPrompt === 'Tidak mengerti.');
  const r4 = ROUTER.route('ahsp', cannedDetect({
    intent: 'CLARIFY_TOPIC', confidence: 0.9, needsClarification: true,
    clarificationPrompt: 'Topik AHSP apa?', param: 'ahsp', localOnly: true,
  }));
  check('route klarifikasi router kanonis diteruskan (tanpa route paksa ke skill)',
    r4.skillId === null && r4.needsClarification === true);
}
{
  const qa = ROUTER.routeQuickAction('AUDIT_RAB');
  check('routeQuickAction AUDIT_RAB -> audit-rab (confidence 1)',
    qa?.skillId === 'audit-rab' && qa.confidence === 1);
  const qaAll = ['AUDIT_RAB', 'HITUNG_VOLUME', 'CARI_AHSP', 'CARI_HARGA', 'ANALISIS_DED',
    'BUAT_LAPORAN', 'PERIKSA_KURVA_S', 'JELASKAN_ITEM', 'RECALCULATE', 'BANTUAN_FITUR'];
  check('routeQuickAction: ke-10 actionId ter-resolve',
    qaAll.every((a) => ROUTER.routeQuickAction(a)?.skillId !== null));
  check('routeQuickAction actionId tak dikenal -> null', ROUTER.routeQuickAction('NOPE') === null);
}
{
  // Skill nonaktif tidak di-route.
  const disabledDef = { ...QUICK_ACTION_SKILL_DEFINITIONS[0], enabled: false };
  const reg2 = new SkillRegistry(LIVE_CATALOG);
  reg2.register(disabledDef);
  const router2 = createSkillRouter(reg2);
  check('skill nonaktif -> routeQuickAction null',
    router2.routeQuickAction('AUDIT_RAB') === null);
}

/* ------------------------------------------------------------------ */
/* C. Disambiguasi berbasis confidence                                 */
/* ------------------------------------------------------------------ */
console.log('\n[C] Disambiguasi berbasis confidence');

{
  const win = disambiguate([
    { skillId: 'cari-ahsp', confidence: 0.92 },
    { skillId: 'cari-harga', confidence: 0.6 },
  ]);
  check('pemenang jelas (0.92 vs 0.60) -> route', win.decision === 'route' && win.skillId === 'cari-ahsp');
  const race = ROUTER.disambiguate([
    { skillId: 'cari-ahsp', confidence: 0.78 },
    { skillId: 'cari-harga', confidence: 0.72 },
  ]);
  check('dua kandidat berdekatan (0.78 vs 0.72) -> clarify',
    race.decision === 'clarify' && race.skillId === null && race.options.length === 2);
  check('pertanyaan klarifikasi menyebut kedua nama tampilan skill',
    (race.question ?? '').includes('Cari AHSP') && (race.question ?? '').includes('Cari Harga'),
    race.question ?? '');
  const low = disambiguate([
    { skillId: 'cari-ahsp', confidence: 0.4 },
    { skillId: 'cari-harga', confidence: 0.3 },
  ]);
  check('semua di bawah ambang (0.40) -> unknown (tanpa tebakan)',
    low.decision === 'unknown' && low.skillId === null);
  const single = disambiguate([{ skillId: 'audit-rab', confidence: 0.9 }]);
  check('satu kandidat kuat -> route', single.decision === 'route' && single.skillId === 'audit-rab');
  const singleWeak = disambiguate([{ skillId: 'audit-rab', confidence: 0.7 }]);
  check('satu kandidat menengah (0.70) -> clarify dengan pertanyaan konfirmasi',
    singleWeak.decision === 'clarify' && (singleWeak.question ?? '').includes('audit-rab'));
  const empty = disambiguate([]);
  check('tanpa kandidat -> unknown', empty.decision === 'unknown');
  const custom = disambiguate(
    [{ skillId: 'a', confidence: 0.7 }, { skillId: 'b', confidence: 0.65 }],
    { routeConfidence: 0.65, margin: 0.01, minConfidence: 0.5 },
  );
  check('ambang kustom dihormati (0.70 route pada routeConfidence 0.65)',
    custom.decision === 'route' && custom.skillId === 'a');
}

/* ------------------------------------------------------------------ */
/* D. Tabel kompatibilitas Copilot                                     */
/* ------------------------------------------------------------------ */
console.log('\n[D] Tabel kompatibilitas Copilot');

{
  // Ke-14 kode detectIntent dibaca dari source Copilot (bukan disalin buta).
  const copilotSrc = readFileSync(resolve(ROOT, 'src/services/coAssistantService.ts'), 'utf8');
  const codes = [...new Set([...copilotSrc.matchAll(/return '([A-Z_]+)';/g)].map((m) => m[1]))]
    .filter((c) => /^[A-Z_]+$/.test(c));
  const detectIntentCodes = [
    'CONVERSATIONAL', 'HELP', 'CREATE_RAB', 'ADD_ITEM', 'DELETE_ITEM', 'UPDATE_ITEM',
    'TOTAL_QUERY', 'SEARCH_QUERY', 'AUDIT', 'KURVA_S', 'PROGRESS', 'DED_QUERY',
    'DOCUMENT', 'RAB_QUERY',
  ];
  check('ke-14 kode detectIntent Copilot ditemukan di source',
    detectIntentCodes.every((c) => codes.includes(c)),
    `ditemukan: ${codes.join(', ')}`);
  check('peta Copilot mencakup ke-14 kode',
    detectIntentCodes.every((c) => c in COPILOT_INTENT_MAP) &&
      Object.keys(COPILOT_INTENT_MAP).length === 14);
  for (const code of ['ADD_ITEM', 'DELETE_ITEM', 'UPDATE_ITEM', 'CREATE_RAB', 'DED_QUERY']) {
    check(`Copilot ${code} ditandai channelBlocked (mutasi dari kanal jawab-saja)`,
      COPILOT_INTENT_MAP[code]?.channelBlocked === true);
    check(`Copilot ${code} -> mapIntentToSkillId null (tidak di-route)`,
      mapIntentToSkillId(code, 'copilot') === null);
  }
  check('Copilot AUDIT -> audit-rab (read-only, aman)', mapIntentToSkillId('AUDIT', 'copilot') === 'audit-rab');
  check('Copilot KURVA_S -> periksa-kurva-s', mapIntentToSkillId('KURVA_S', 'copilot') === 'periksa-kurva-s');
  check('Copilot HELP -> bantuan-fitur', mapIntentToSkillId('HELP', 'copilot') === 'bantuan-fitur');
  check('Copilot PROGRESS = kesenjangan terdokumentasi (tanpa ChatIntent/skill)',
    COPILOT_INTENT_MAP.PROGRESS?.skillId === null &&
      COPILOT_INTENT_MAP.PROGRESS?.chatIntent === null &&
      (COPILOT_INTENT_MAP.PROGRESS?.note ?? '').includes('KESENJANGAN'));
  check('Copilot UPDATE_ITEM ditandai AMBIGU (volume vs harga)',
    (COPILOT_INTENT_MAP.UPDATE_ITEM?.note ?? '').includes('AMBIGU'));
  check('Copilot SEARCH_QUERY ditandai AMBIGU (AHSP vs item)',
    (COPILOT_INTENT_MAP.SEARCH_QUERY?.note ?? '').includes('AMBIGU'));
  check('Copilot DOCUMENT -> summarize-document (padanan sebagian)',
    mapIntentToSkillId('DOCUMENT', 'copilot') === 'summarize-document');
}

console.log(`\n${failed === 0 ? 'SEMUA TES ROUTER SKILL LULUS' : 'ADA TES GAGAL'} — lulus ${passed}, gagal ${failed}`);
if (failures.length) console.log('Gagal:', failures.join(' | '));
process.exit(failed === 0 ? 0 : 1);

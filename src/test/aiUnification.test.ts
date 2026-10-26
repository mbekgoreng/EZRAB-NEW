/**
 * EZRAB — AI UNIFICATION FASE 1 — TEST SUITE (2026-10-26)
 * Menguji resolver tunggal src/ai-tools/aiNavigation.ts (openEzrabAI):
 *  1. Pemetaan setiap mode → tujuan + menu yang benar.
 *  2. Konteks (projectId/prompt/rabItemId/documentId/source) terbawa,
 *     dan tidak tertukar antar proyek (dua entry berurutan).
 *  3. Entry sekali-pakai (konsumsi kedua = kosong).
 *  4. Deep link lama (magic-ai/ai/ezrab-ai/ded-ai/dokumen-ai) ter-parse
 *     ke menu yang benar (SuperView DED tetap di magic-ai/ai).
 *  5. Tidak ada loop: resolver memanggil helper, bukan dirinya sendiri.
 *  6. API lama (requestAiEntry/goToAi) tetap utuh.
 *
 * Jalankan: npx --yes tsx src/test/aiUnification.test.ts
 */
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import {
  openEzrabAI,
  ezrabAiMenuFor,
  ezrabAiDestinationFor,
  consumePendingAiEntry,
  consumePendingEzrabAiEntry,
  peekPendingAiEntry,
  peekPendingEzrabAiEntry,
  clearPendingAiEntry,
  clearPendingEzrabAiEntry,
  requestAiEntry,
} from '../ai-tools/aiNavigation';
import { parseWorkspaceRoute } from '../routing/routes';

// Mock window untuk navigateTo + event (pola universalRab.test.ts).
const dispatched: string[] = [];
let lastUrl = '';
(global as any).window = {
  history: {
    pushState: (_s: unknown, _t: string, url: string) => { lastUrl = url; },
    replaceState: (_s: unknown, _t: string, url: string) => { lastUrl = url; },
  },
  dispatchEvent: (e: { type?: string }) => { dispatched.push(e?.type ?? 'event'); return true; },
  addEventListener: () => {},
  removeEventListener: () => {},
};

let passed = 0;
let failed = 0;
function check(cond: boolean, name: string): void {
  if (cond) { passed++; }
  else { failed++; console.error('FAIL:', name); }
}
function reset(): void {
  clearPendingAiEntry();
  clearPendingEzrabAiEntry();
  dispatched.length = 0;
  lastUrl = '';
}

// 1. Pemetaan mode → tujuan + menu
check(ezrabAiMenuFor('chat') === 'ezrab-ai', '1a: chat → ezrab-ai');
check(ezrabAiMenuFor('rab-generator') === 'ezrab-ai', '1b: rab-generator → ezrab-ai');
check(ezrabAiMenuFor('ded') === 'ded-ai', '1c: ded → ded-ai');
check(ezrabAiMenuFor('document') === 'dokumen-ai', '1d: document → dokumen-ai');
check(ezrabAiDestinationFor('chat') === 'chat_agent', '1e: chat → chat_agent');
check(ezrabAiDestinationFor('rab-generator') === 'chat_agent', '1f: rab-generator → chat_agent');
check(ezrabAiDestinationFor('ded') === 'ded_rab_ai', '1g: ded → ded_rab_ai');
check(ezrabAiDestinationFor('document') === 'document_ai', '1h: document → document_ai');

// 2. openEzrabAI chat: konteks + URL proyek
reset();
openEzrabAI({ mode: 'chat', projectId: 'proj-A', projectName: 'Gedung A', source: 'dashboard' });
check(peekPendingAiEntry()?.dest === 'chat_agent', '2a: chat menitip entry klasik chat_agent');
check(peekPendingAiEntry()?.ctx.projectId === 'proj-A', '2b: projectId terbawa di entry klasik');
check(peekPendingAiEntry()?.ctx.sourceMenu === 'dashboard', '2c: source terbawa di entry klasik');
check(peekPendingEzrabAiEntry()?.mode === 'chat', '2d: entry mode chat tersedia untuk EzrabAiView');
check(peekPendingEzrabAiEntry()?.ctx.projectName === 'Gedung A', '2e: projectName terbawa di entry mode');
check(lastUrl.includes('/ezrab-ai'), '2f: URL tujuan mengandung ezrab-ai');
check(lastUrl.includes('proj-A'), '2g: URL tujuan membawa projectId');

// 3. rab-generator: tetap chat_agent/ezrab-ai + prompt prefill
reset();
openEzrabAI({ mode: 'rab-generator', prompt: 'buatkan rab paving 300 m2', source: 'create-project' });
check(peekPendingAiEntry()?.dest === 'chat_agent', '3a: rab-generator → chat_agent (bukan panel baru)');
check(peekPendingAiEntry()?.ctx.initialPrompt === 'buatkan rab paving 300 m2', '3b: prompt terbawa sebagai initialPrompt');
check(peekPendingEzrabAiEntry()?.mode === 'rab-generator', '3c: entry mode rab-generator');
check(peekPendingEzrabAiEntry()?.ctx.source === 'create-project', '3d: source create-project terbawa');

// 4. ded: ke ded-ai, TANPA entry mode chat (tidak bocor ke chat)
reset();
openEzrabAI({ mode: 'ded', projectId: 'proj-A', dedRef: 'DED Gedung A.pdf', source: 'dashboard' });
check(peekPendingAiEntry()?.dest === 'ded_rab_ai', '4a: ded → ded_rab_ai');
check(peekPendingEzrabAiEntry() === null, '4b: ded tidak menitip entry mode chat');
check(lastUrl.includes('/ded-ai'), '4c: URL tujuan mengandung ded-ai');
check(peekPendingAiEntry()?.ctx.contextLabel === 'DED Gedung A.pdf', '4d: dedRef terbawa sebagai contextLabel');

// 5. document: ke dokumen-ai + documentId terbawa
reset();
openEzrabAI({ mode: 'document', documentId: 'doc-9', source: 'other' });
check(peekPendingAiEntry()?.dest === 'document_ai', '5a: document → document_ai');
check(peekPendingAiEntry()?.ctx.documentId === 'doc-9', '5b: documentId terbawa');
check(lastUrl.includes('/dokumen-ai'), '5c: URL tujuan mengandung dokumen-ai');

// 6. Inspector: chat + rabItemId + prompt audit (prefill lewat entry klasik)
reset();
openEzrabAI({
  mode: 'chat', projectId: 'proj-A', prompt: 'Audit koefisien AHSP untuk item X.',
  rabItemId: 'rab-123', source: 'inspector',
});
check(peekPendingEzrabAiEntry()?.ctx.rabItemId === 'rab-123', '6a: rabItemId terbawa');
check(peekPendingEzrabAiEntry()?.ctx.prompt === 'Audit koefisien AHSP untuk item X.', '6b: prompt audit terbawa');
check(peekPendingEzrabAiEntry()?.ctx.source === 'inspector', '6c: source inspector terbawa');
check(peekPendingAiEntry()?.ctx.initialPrompt === 'Audit koefisien AHSP untuk item X.', '6d: prompt audit jadi initialPrompt (prefill)');

// 7. Dua entry berurutan tidak tertukar: yang terakhir yang terkonsumsi,
//    yang pertama tidak muncul kembali
reset();
openEzrabAI({ mode: 'chat', projectId: 'proj-A', projectName: 'Gedung A', source: 'dashboard' });
openEzrabAI({ mode: 'chat', projectId: 'proj-B', projectName: 'Villa B', source: 'mobile' });
const ezSecond = consumePendingEzrabAiEntry();
check(ezSecond?.projectId === 'proj-B', '7a: entry kedua (proj-B) yang terkonsumsi, bukan proj-A');
check(ezSecond?.projectName === 'Villa B', '7b: projectName ikut entry kedua');
check(consumePendingEzrabAiEntry() === null, '7c: konsumsi kedua entry mode = kosong');
const classicSecond = consumePendingAiEntry('chat_agent');
check(classicSecond?.projectId === 'proj-B', '7d: entry klasik kedua juga proj-B');
check(consumePendingAiEntry('chat_agent') === null, '7e: konsumsi kedua entry klasik = kosong');

// 8. Entry sekali-pakai (satu open → satu konsumsi per jalur)
reset();
openEzrabAI({ mode: 'rab-generator', prompt: 'paving 100 m2', projectId: 'proj-A' });
check(consumePendingEzrabAiEntry()?.mode === 'rab-generator', '8a: konsumsi pertama entry mode berhasil');
check(consumePendingEzrabAiEntry() === null, '8b: konsumsi kedua entry mode = kosong');
check(consumePendingAiEntry('chat_agent')?.initialPrompt === 'paving 100 m2', '8c: konsumsi pertama entry klasik berhasil');
check(consumePendingAiEntry('chat_agent') === null, '8d: konsumsi kedua entry klasik = kosong');

// 9. Deep link lama tetap ter-parse ke menu yang benar (SuperView tetap)
check(parseWorkspaceRoute('/app/magic-ai').menu === 'magic-ai', '9a: /app/magic-ai → magic-ai (SuperView)');
check(parseWorkspaceRoute('/app/ai').menu === 'magic-ai', '9b: /app/ai → magic-ai (SuperView)');
check(parseWorkspaceRoute('/app/magic-ai?mode=ded-rab').menu === 'magic-ai', '9c: /app/magic-ai?mode=ded-rab → magic-ai');
check(parseWorkspaceRoute('/app/magic-ai?mode=ded-rab').mode === 'ded-rab', '9d: mode ded-rab dipertahankan di SuperView');
check(parseWorkspaceRoute('/app/ezrab-ai').menu === 'ezrab-ai', '9e: /app/ezrab-ai → ezrab-ai');
check(parseWorkspaceRoute('/app/ded-ai').menu === 'ded-ai', '9f: /app/ded-ai → ded-ai');
check(parseWorkspaceRoute('/app/dokumen-ai').menu === 'dokumen-ai', '9g: /app/dokumen-ai → dokumen-ai');
check(parseWorkspaceRoute('/app/projects/proj-A/ezrab-ai').menu === 'ezrab-ai', '9h: route proyek ezrab-ai → ezrab-ai');
check(parseWorkspaceRoute('/app/projects/proj-A/ezrab-ai').projectId === 'proj-A', '9i: route proyek membawa projectId');

// 10. Tidak ada loop: resolver tidak memanggil dirinya sendiri
reset();
dispatched.length = 0;
openEzrabAI({ mode: 'chat', projectId: 'proj-A' });
check(dispatched.length === 2, `10a: satu openEzrabAI hanya memicu 2 event (entry + navigate), aktual ${dispatched.length}`);
const navSrc = fs.readFileSync(path.resolve('src/ai-tools/aiNavigation.ts'), 'utf8');
const selfCalls = (navSrc.match(/openEzrabAI\(/g) || []).length;
check(selfCalls === 1, `10b: 'openEzrabAI(' hanya muncul 1x di aiNavigation.ts (deklarasi), aktual ${selfCalls}`);

// 11. API lama tetap utuh
reset();
requestAiEntry('chat_agent', { projectId: 'proj-L', initialPrompt: 'halo' });
check(consumePendingAiEntry('chat_agent')?.initialPrompt === 'halo', '11a: requestAiEntry/consume lama tetap jalan');
check(consumePendingAiEntry('chat_agent') === null, '11b: entry lama sekali-pakai');
check(consumePendingAiEntry('ded_rab_ai') === null, '11c: entry tujuan lain tidak tertukar');

console.log(`aiUnification: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

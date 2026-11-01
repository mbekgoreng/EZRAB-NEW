/**
 * DED-to-RAB — Sprint 1 Workstream A: integritas prompt + pemulihan respons.
 *
 * Mengunci perbaikan akar masalah audit 2026-10-31 (0/8 analisis DED hidup):
 * gateway memotong systemPrompt ke 8.000 karakter, sedangkan prompt lama
 * ±25 ribu karakter dengan katalog WBS penuh SEBELUM skema JSON — skema
 * tidak pernah sampai ke model.
 *
 * Yang diuji:
 *  1. Anggaran keras: prompt sistem rakitan dari ketiga builder (FAST,
 *     DETAIL, Full AI kedua kedalaman) ≤ 7.900 karakter untuk semua tipe
 *     proyek yang didukung + tipe tak dikenal, kedua kebijakan harga.
 *  2. Urutan kontrak: skema keluaran (workItems/items) muncul SEBELUM blok
 *     konteks WBS, dan penanda wajib ("JSON MURNI", header spesifikasi
 *     tepat satu kali) selalu hadir.
 *  3. Selektor konteks wbsContext: seksi per keluarga tipe, fallback aman
 *     tipe tak dikenal tercatat (fallback=true, §0+§2+§6+§7+§8), §1 tidak
 *     pernah dipilih, §9/§10 hanya bila anggaran tersisa.
 *  4. Penegak anggaran: kontrak yang sendirian melebihi anggaran → error
 *     terstruktur DED_PROMPT_BUDGET_EXCEEDED (tidak pernah prompt cacat).
 *  5. Pemulihan respons (parseDedAiModelResponse + classifyPassOutcome):
 *     JSON murni / berpagar / terbungkus prosa terpulihkan; prosa markdown
 *     murni dan JSON rusak tetap MALFORMED; workItems kosong = EMPTY,
 *     bukan sukses.
 */
import { createFastSystemPrompt } from '../ai-tools/ded-ai-estimate/prompts/fast';
import { createDetailSystemPrompt } from '../ai-tools/ded-ai-estimate/prompts/detail';
import { buildFullAiSystemPrompt } from '../ai-tools/ded-full-ai/prompts';
import {
  assembleDedSystemPrompt,
  selectWbsContext,
  splitWorkClassificationSpec,
  DedPromptBudgetError,
  DED_SYSTEM_PROMPT_BUDGET_CHARS,
} from '../ai-tools/ded-ai-estimate/prompts/wbsContext';
import { WORK_CLASSIFICATION_SPEC } from '../ai-tools/ded-ai-estimate/prompts/work-classification.generated';
import { parseDedAiModelResponse, classifyPassOutcome } from '../ai-tools/ded-ai-estimate/service';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; } else { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}
const count = (hay: string, needle: string) => hay.split(needle).length - 1;

const BUDGET = DED_SYSTEM_PROMPT_BUDGET_CHARS;
const POLICIES = ['FULL_AI', 'DATABASE'] as const;
const REPORT_TYPES = ['BANGUNAN', 'JALAN', 'IRIGASI', 'XXX-TAK-DIKENAL'];
const ALL_TYPES = ['BANGUNAN', 'GEDUNG', 'JALAN', 'PAVING', 'IRIGASI', 'BENDUNGAN', 'BANGUNAN AIR', 'JEMBATAN', 'INDUSTRI', 'XXX-TAK-DIKENAL', ''];

type Builder = (t: string, p: (typeof POLICIES)[number]) => string;
const BUILDERS: Array<{ name: string; fn: Builder; schemaKey: string }> = [
  { name: 'FAST', fn: (t, p) => createFastSystemPrompt({ projectType: t, pricingPolicy: p }), schemaKey: '"workItems"' },
  { name: 'DETAIL', fn: (t, p) => createDetailSystemPrompt({ projectType: t, pricingPolicy: p }), schemaKey: '"workItems"' },
  { name: 'FULLAI-FAST', fn: (t, p) => buildFullAiSystemPrompt(t, 'FAST', p), schemaKey: '"items"' },
  { name: 'FULLAI-ADV', fn: (t, p) => buildFullAiSystemPrompt(t, 'ADVANCED', p), schemaKey: '"items"' },
];

console.log('=== 1. Anggaran keras ≤ 7.900 (konstanta diekspor) ===');
check('DED_SYSTEM_PROMPT_BUDGET_CHARS = 7900', BUDGET === 7900, `aktual ${BUDGET}`);
for (const b of BUILDERS) {
  for (const pol of POLICIES) {
    let maxLen = 0;
    let maxType = '';
    let threw = '';
    for (const t of ALL_TYPES) {
      try {
        const s = b.fn(t, pol);
        if (s.length > maxLen) { maxLen = s.length; maxType = t || '(kosong)'; }
      } catch (e: any) {
        threw = `${t || '(kosong)'}: ${e?.code ?? e?.message}`;
      }
    }
    check(`${b.name}/${pol}: tidak ada tipe yang melempar error anggaran`, threw === '', threw);
    check(`${b.name}/${pol}: semua tipe ≤ ${BUDGET}`, maxLen <= BUDGET, `maks ${maxLen} @ ${maxType}`);
  }
}

console.log('=== 2. Skema selamat & urutan kontrak < konteks ===');
for (const b of BUILDERS) {
  for (const pol of POLICIES) {
    for (const t of REPORT_TYPES) {
      const s = b.fn(t, pol);
      const schemaAt = s.indexOf(b.schemaKey);
      const ctxAt = s.indexOf('SPESIFIKASI KLASIFIKASI');
      check(`${b.name}/${pol}/${t}: skema ${b.schemaKey} hadir`, schemaAt >= 0);
      check(`${b.name}/${pol}/${t}: skema SEBELUM konteks WBS`, schemaAt >= 0 && ctxAt > schemaAt, `skema@${schemaAt} konteks@${ctxAt}`);
      check(`${b.name}/${pol}/${t}: penanda "JSON MURNI" hadir`, s.includes('JSON MURNI'));
      check(`${b.name}/${pol}/${t}: header spesifikasi tepat 1×`, count(s, 'SPESIFIKASI KLASIFIKASI & WBS DED–RAB (wajib diikuti') === 1);
      check(`${b.name}/${pol}/${t}: jauh di bawah ukuran katalog penuh`, s.length < WORK_CLASSIFICATION_SPEC.length, `${s.length} vs spec ${WORK_CLASSIFICATION_SPEC.length}`);
    }
  }
}
// Penanda wajib per tipe pada builder standar: status bukti + interior + token bendungan (header konteks)
for (const pol of POLICIES) {
  const s = createFastSystemPrompt({ projectType: 'BANGUNAN', pricingPolicy: pol });
  check(`FAST/${pol}/BANGUNAN: DRAWING_CONFIRMED hadir`, s.includes('DRAWING_CONFIRMED'));
  check(`FAST/${pol}/BANGUNAN: PROPOSED_NOT_IN_SOURCE hadir`, s.includes('PROPOSED_NOT_IN_SOURCE'));
  check(`FAST/${pol}/BANGUNAN: Pekerjaan Interior hadir`, s.includes('Pekerjaan Interior'));
  check(`FAST/${pol}/BANGUNAN: token BENDUNGAN hadir`, s.includes('BENDUNGAN'));
  check(`FAST/${pol}/BANGUNAN: penanda potongan […] muncul saat konteks dipangkas`, s.includes('[…]'));
}

console.log('=== 3. Selektor konteks per tipe ===');
const selCases: Array<{ t: string; sections: number[]; fallback: boolean; family: number }> = [
  { t: 'BANGUNAN', sections: [0, 3, 7, 8], fallback: false, family: 3 },
  { t: 'GEDUNG', sections: [0, 3, 7, 8], fallback: false, family: 3 },
  { t: 'INDUSTRI', sections: [0, 3, 7, 8], fallback: false, family: 3 },
  { t: 'BENDUNGAN', sections: [0, 4, 7, 8], fallback: false, family: 4 },
  { t: 'IRIGASI', sections: [0, 4, 7, 8], fallback: false, family: 4 },
  { t: 'BANGUNAN AIR', sections: [0, 4, 7, 8], fallback: false, family: 4 },
  { t: 'JALAN', sections: [0, 5, 7, 8], fallback: false, family: 5 },
  { t: 'PAVING', sections: [0, 5, 7, 8], fallback: false, family: 5 },
  { t: 'JEMBATAN', sections: [0, 6, 7, 8], fallback: false, family: 6 },
  { t: 'KAMPUNG-ADAT', sections: [0, 2, 6, 7, 8], fallback: true, family: 6 },
  { t: '', sections: [0, 2, 6, 7, 8], fallback: true, family: 6 },
];
for (const c of selCases) {
  const sel = selectWbsContext(c.t, { engine: 'standard' });
  check(`selektor "${c.t || '(kosong)'}": sectionsUsed = [${c.sections}]`, JSON.stringify(sel.sectionsUsed) === JSON.stringify(c.sections), `aktual [${sel.sectionsUsed}]`);
  check(`selektor "${c.t || '(kosong)'}": fallback = ${c.fallback}`, sel.fallback === c.fallback);
  check(`selektor "${c.t || '(kosong)'}": familySection = ${c.family}`, sel.familySection === c.family);
  check(`selektor "${c.t || '(kosong)'}": §1 tidak pernah dipilih`, !sel.sectionsUsed.includes(1));
  check(`selektor "${c.t || '(kosong)'}": chars konsisten dengan teks`, sel.chars === sel.text.length);
}
// Pemisahan spesifikasi deterministik: 11 seksi (§0–§10), irisan murni.
const specSections = splitWorkClassificationSpec();
check('spesifikasi terpecah menjadi 11 seksi (§0–§10)', specSections.size === 11, `aktual ${specSections.size}`);
check('irisan seksi utuh (gabungan + header = spesifikasi asli)', [...specSections.values()].every((v) => v.startsWith('## ')));

console.log('=== 4. Penegak anggaran & §9/§10 oportunistik ===');
{
  let err: unknown = null;
  try {
    assembleDedSystemPrompt('x'.repeat(BUDGET + 500), 'BANGUNAN', { engine: 'standard' });
  } catch (e) { err = e; }
  check('kontrak melebihi anggaran → DedPromptBudgetError', err instanceof DedPromptBudgetError);
  check('error berkode DED_PROMPT_BUDGET_EXCEEDED', (err as DedPromptBudgetError | null)?.code === 'DED_PROMPT_BUDGET_EXCEEDED');
}
{
  // Kontrak kecil + tipe berkonteks ramping (JALAN): §9 & §10 muat → ditambahkan.
  const r = assembleDedSystemPrompt('Kamu estimator DED.', 'JALAN', { engine: 'standard' });
  check('anggaran tersisa → §9 ditambahkan', r.selection.sectionsUsed.includes(9), `[${r.selection.sectionsUsed}]`);
  check('anggaran tersisa → §10 ditambahkan', r.selection.sectionsUsed.includes(10), `[${r.selection.sectionsUsed}]`);
  check('rakitan kontrak kecil tetap ≤ anggaran', r.system.length <= BUDGET, `${r.system.length}`);
}
{
  // Kontrak kecil + BANGUNAN (konteks terbesar): §9/§10 tidak muat → tidak dipaksakan.
  const r = assembleDedSystemPrompt('Kamu estimator DED.', 'BANGUNAN', { engine: 'standard' });
  check('anggaran ketat → §9 tidak dipaksakan', !r.selection.sectionsUsed.includes(9));
  check('rakitan BANGUNAN tetap ≤ anggaran', r.system.length <= BUDGET, `${r.system.length}`);
  check('konteks BANGUNAN dipangkas tercatat di trimmedSections', r.selection.trimmedSections.length === 0, 'kontrak kecil tidak memicu potong');
}

console.log('=== 5. Pemulihan respons model ===');
const payload = (items: unknown[]) => JSON.stringify({ projectType: 'BANGUNAN', summary: 'uji', workItems: items });
const oneItem = [{ id: 'a', name: 'Galian tanah', units: 'm3', quantity: 10 }];
function outcomeOf(content: unknown) {
  const r = parseDedAiModelResponse(content);
  return { ...r, outcome: classifyPassOutcome(r.parsed, r.parseFailed) };
}
{
  const r = outcomeOf(payload(oneItem));
  check('JSON murni: ter-parse', !r.parseFailed && r.parsed != null);
  check('JSON murni: klasifikasi OK 1 item', r.outcome.status === 'OK' && r.outcome.items.length === 1);
}
{
  const r = outcomeOf('```json\n' + payload(oneItem) + '\n```');
  check('JSON berpagar markdown: klasifikasi OK', r.outcome.status === 'OK' && r.outcome.items.length === 1);
}
{
  const r = outcomeOf('Berikut daftar pekerjaan yang saya temukan dari DED:\n\n' + payload(oneItem) + '\n\nSemoga membantu.');
  check('JSON terbungkus prosa: klasifikasi OK', r.outcome.status === 'OK' && r.outcome.items.length === 1);
}
{
  // Objek prosa yang LEBIH PANJANG dari payload tidak boleh membajak hasil
  // (kelemahan heuristik "rentang terpanjang" yang digantikan Sprint 1).
  const decoy = JSON.stringify({ catatan: 'x'.repeat(600), daftar: Array.from({ length: 20 }, (_, i) => ({ i })) });
  const r = outcomeOf(`Catatan awal: ${decoy}\nHasil analisis: ${payload(oneItem)}`);
  check('objek umpan lebih panjang: payload workItems tetap menang', r.outcome.status === 'OK' && r.outcome.items.length === 1);
}
{
  const r = outcomeOf('## Hasil Analisis\n\n- Pekerjaan tanah\n- Pekerjaan pondasi\n\nTidak ada format JSON pada respons ini.');
  check('prosa markdown murni: parseFailed', r.parseFailed === true);
  check('prosa markdown murni: MALFORMED_JSON (bukan sukses palsu)', r.outcome.status === 'MALFORMED_RESPONSE' && r.outcome.errorCode === 'MALFORMED_JSON');
}
{
  const r = outcomeOf('{"projectType":"BANGUNAN","workItems":[{"name":"Galian"');
  check('JSON terpotong/rusak: MALFORMED_JSON', r.outcome.status === 'MALFORMED_RESPONSE' && r.outcome.errorCode === 'MALFORMED_JSON');
}
{
  const r = outcomeOf(payload([]));
  check('workItems kosong: EMPTY_RESPONSE (bukan OK)', r.outcome.status === 'EMPTY_RESPONSE' && r.outcome.items.length === 0);
  check('workItems kosong: parse tidak gagal', r.parseFailed === false);
}
{
  const r = outcomeOf('{"projectType":"BANGUNAN","items":[]}');
  check('objek tanpa workItems: MALFORMED_RESPONSE', r.outcome.status === 'MALFORMED_RESPONSE' && r.outcome.errorCode === 'MALFORMED_RESPONSE');
}
{
  const r = outcomeOf('{"workItems":"bukan array"}');
  check('workItems bukan array: MALFORMED_RESPONSE', r.outcome.status === 'MALFORMED_RESPONSE' && r.outcome.errorCode === 'MALFORMED_RESPONSE');
}
{
  const r = outcomeOf('{"workItems":[{"name":"Galian",}],}');
  check('koma ekor: terpulihkan (paritas extractJson)', r.outcome.status === 'OK' && r.outcome.items.length === 1);
}
{
  const r = outcomeOf('');
  check('respons kosong: parseFailed → MALFORMED', r.parseFailed === true && r.outcome.status === 'MALFORMED_RESPONSE');
}
{
  // Kurung kurawal di dalam string tidak merusak pemindaian seimbang.
  const tricky = JSON.stringify({ workItems: [{ name: 'Pipa {khusus} "dia"', units: 'm', quantity: 3 }] });
  const r = outcomeOf('Prosa pembuka {bukan json}. ' + tricky);
  check('kurung di dalam string + prosa berk kurung: OK', r.outcome.status === 'OK' && r.outcome.items.length === 1);
}

console.log(`\n=== HASIL: ${pass} PASS, ${fail} FAIL ===`);
if (fail > 0) process.exit(1);

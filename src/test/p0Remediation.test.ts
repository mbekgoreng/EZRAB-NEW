/**
 * p0Remediation — tes regresi remediasi P0 Construction Intelligence
 * (2026-11-08): perbaikan 30 KNOWN-DEFECT audit ekstrem + A-098,
 * gerbang keamanan §6 brief, dan integrasi jalur produksi §3.
 *
 * Suite ini adalah PENJAGA: setiap asersi memetakan ke satu cacat /
 * satu butir brief. Bukti utama tetap extremeBenchmark (800 kasus)
 * dan constructionAiScenarios (364) — suite ini mengunci perilaku
 * per-akar agar regresi berikutnya tertangkap pada level unit.
 *
 * Cara jalan: npx --yes tsx src/test/p0Remediation.test.ts
 * Exit 0 = semua lulus; ringkasan JSON ke $TMPDIR/p0-remediation-results.json.
 */
import { writeFileSync } from 'fs';
import { join } from 'path';

import { buildUniversalDraft, displayPriceStatus, detectScopes } from '../ai-tools/ezrab-ai/universalRab';
import { understandProject, assessBuildingMissingInfo } from '../ai-tools/ezrab-ai/buildingTypology';
import { validatePhysicalDimensions, extractRabNeeds } from '../ai-tools/ezrab-ai/rabNeeds';
import { searchChatAhsp } from '../ai-tools/ezrab-ai/chatSearch';
import { searchConstructionKnowledge, formatKnowledgeContext } from '../ai-tools/ezrab-ai/constructionRetrieval';
import { toolCalculateQto, toolCalculateBuildingArea, CONSTRUCTION_TOOL_REGISTRY } from '../ai-tools/ezrab-ai/constructionTools';
import { executeIntent, continueRabNeeds } from '../ai-tools/ezrab-ai/actionRegistry';
import { listFeedback, clearFeedback, setFeedbackSink, captureFeedback, createLocalFeedbackSink, readLocalFeedbackEvents, clearLocalFeedbackEvents } from '../ai-tools/ezrab-ai/constructionFeedback';
import { calculatorRegistry } from '../engine/calculatorCore/registry/calculatorRegistry';
import { EZRAB_AI_TOOL_MAP, runTool } from '../ai-tools/ezrab-ai/tools';

let pass = 0;
let fail = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) { pass++; return; }
  fail++;
  failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
  console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
}
function throws(fn: () => unknown): boolean {
  try { fn(); return false; } catch { return true; }
}

/* ------------------------------------------------------------------ */
/* Kelompok 1 — 16 fungsi tanpa template (A-080…A-095)                 */
/* ------------------------------------------------------------------ */
const NEW_FUNCTIONS = [
  'minimarket 8x12', 'restoran 10x15', 'kafe 8x10', 'showroom 12x20',
  'apotek 6x9', 'laundry 5x8', 'kios 4x6', 'warung 3x5',
  'kolam ikan 10x20', 'musholla 8x10', 'vihara 15x20', 'klenteng 12x18',
  'madrasah 12x20', 'perpustakaan 15x20', 'kontrakan 10 unit', 'gereja 15x25',
];
for (const t of NEW_FUNCTIONS) {
  const d: any = buildUniversalDraft(`buatkan rab ${t}`);
  check(`A-fungsi draft: ${t}`, d.kind === 'draft', `kind=${d.kind}`);
  if (d.kind === 'draft') {
    const items = d.draft.parts.flatMap((p: any) => p.generation.items ?? []);
    check(`A-fungsi item tak ber-Rp0-palsu: ${t}`, items.every((it: any) => it.unitPrice == null || it.unitPrice > 0 || it.priceStatus === 'PRICE_UNRESOLVED'));
  }
}
{
  const d: any = buildUniversalDraft('buatkan rab kolam ikan 10x20');
  check('A-088 kolam ikan memakai template kolam', d.kind === 'draft' && d.draft.parts.some((p: any) => /kolam/i.test(p.template.name)), d.kind === 'draft' ? d.draft.parts.map((p: any) => p.template.id).join(',') : d.kind);
  const d2: any = buildUniversalDraft('buatkan rab perpustakaan 15x20');
  check('A-093 perpustakaan memakai template perpustakaan', d2.kind === 'draft' && d2.draft.parts.some((p: any) => /perpustakaan|library/i.test(p.template.name)), d2.kind === 'draft' ? d2.draft.parts.map((p: any) => p.template.id).join(',') : d2.kind);
  const d3: any = buildUniversalDraft('buatkan rab kontrakan 10 unit');
  check('A-094 kontrakan: basis jumlah diteruskan ke parameter template', d3.kind === 'draft' && d3.draft.assumptions.some((a: string) => /10/.test(a) && /(unit|kamar|villa|ruang)/i.test(a)), d3.kind === 'draft' ? d3.draft.assumptions.join(' | ').slice(0, 160) : d3.kind);
  const u = understandProject('buatkan rab gereja 15x25');
  check('A-095 gereja: pengelompokan rumah ibadah dinyatakan terbuka (flag)', u.flags.some((f) => /gereja/i.test(f) && /rumah ibadah/i.test(f)), u.flags.join(' | '));
}

/* ------------------------------------------------------------------ */
/* Kelompok 2/3 — validasi lahan, amplop, lantai (A-096/097/098)       */
/* ------------------------------------------------------------------ */
check('A-096 lahan negatif = masalah validasi', validatePhysicalDimensions('buatkan rab gudang 10x20 tanah -500 m2').some((p) => /lahan/i.test(p) && /tidak valid/i.test(p)));
check('A-096 draft ditolak (needs-spec)', (buildUniversalDraft('buatkan rab gudang 10x20 tanah -500 m2') as any).kind === 'needs-spec');
check('A-097 tapak absurd = masalah amplop', validatePhysicalDimensions('buatkan rab gudang 99999x99999').some((p) => /amplop/i.test(p)));
check('A-097 draft ditolak (needs-spec)', (buildUniversalDraft('buatkan rab gudang 99999x99999') as any).kind === 'needs-spec');
{
  const u = understandProject('buatkan rab gudang 10x20 100 lantai');
  check('A-098 lantai eksplisit TERCATAT apa adanya (100, bukan disucikan ke 1)', u.floors.value === 100 && u.floors.explicit, `floors=${u.floors.value}`);
  check('A-098 lantai absurd ditandai amplop (klarifikasi terbuka)', validatePhysicalDimensions('buatkan rab gudang 10x20 100 lantai').some((p) => /60 lantai/.test(p)));
  check('A-098 draft tidak dibuat dari lantai absurd', (buildUniversalDraft('buatkan rab gudang 10x20 100 lantai') as any).kind === 'needs-spec');
  check('amplop tidak mengganggu lantai wajar (25 lantai lolos)', validatePhysicalDimensions('buatkan rab apartemen 25 lantai 20x30').length === 0);
  check('amplop tidak mengganggu gudang besar wajar (100x200)', validatePhysicalDimensions('buatkan rab gudang 100x200').length === 0);
}

/* A-099 / A-100 — dimensi kata bilangan & rasio */
{
  const u = understandProject('buatkan rab gudang sepuluh kali dua puluh');
  check('A-099 kata bilangan terbaca (tapak 200)', u.footprint.value === 200, `footprint=${u.footprint.value}`);
  check('A-099 draft terbentuk', (buildUniversalDraft('buatkan rab gudang sepuluh kali dua puluh') as any).kind === 'draft');
  const u2 = understandProject('buatkan rab gudang 10:20');
  check('A-100 rasio ukuran terbaca (tapak 200)', u2.footprint.value === 200, `footprint=${u2.footprint.value}`);
  check('A-100 draft terbentuk', (buildUniversalDraft('buatkan rab gudang 10:20') as any).kind === 'draft');
  const u3 = understandProject('plesteran dinding campuran 1:4');
  check('A-100 penjaga: rasio campuran 1:4 TIDAK menjadi dimensi', u3.footprint.value == null, `footprint=${u3.footprint.value}`);
}

/* ------------------------------------------------------------------ */
/* Kelompok 4 — negasi fungsi (G-081)                                  */
/* ------------------------------------------------------------------ */
{
  const u = understandProject('buatkan rab bukan gudang tapi rumah 6x10');
  check('G-081 "bukan gudang tapi rumah" → rumah-tinggal', u.functionId === 'rumah-tinggal', `fn=${u.functionId}`);
  const u2 = understandProject('buatkan rab jangan rumah, gudang saja 10x20');
  check('G-081 arah sebaliknya: "jangan rumah, gudang saja" → gudang', u2.functionId === 'gudang', `fn=${u2.functionId}`);
  const u3 = understandProject('buatkan rab gudang bukan gedung 10x20');
  check('G-081 regresi: "gudang bukan gedung" tetap gudang', u3.functionId === 'gudang', `fn=${u3.functionId}`);
  const u4 = understandProject('buatkan rab rumah tidak bertingkat 6x10');
  check('G-081 regresi: "rumah tidak bertingkat" tetap rumah 1 lantai', u4.functionId === 'rumah-tinggal' && u4.floors.value === 1, `fn=${u4.functionId} floors=${u4.floors.value}`);
  check('G-081 kata ternegasi tidak memicu cakupan', detectScopes('buatkan rab bukan gudang tapi rumah 6x10').length === 0, detectScopes('buatkan rab bukan gudang tapi rumah 6x10').map((s) => s.id).join(','));
  check('G-081 hasil akhir needs-spec kontekstual rumah (bukan draft template gudang)', (buildUniversalDraft('buatkan rab bukan gudang tapi rumah 6x10') as any).kind === 'needs-spec');
  check('G-081 regresi cakupan: "gudang bukan gedung" tetap memicu cakupan gedung', detectScopes('buatkan rab gudang bukan gedung 10x20').some((s) => s.id === 'gedung'));
  const nk = extractRabNeeds('bukan gudang tapi rumah 6x10');
  check('G-081 jenis kebutuhan ikut terkoreksi (rumah)', nk.kind === 'rumah', `kind=${nk.kind}`);
}

/* ------------------------------------------------------------------ */
/* Kelompok 5/6 — resolver & retrieval (C-039/040/090/091)             */
/* ------------------------------------------------------------------ */
check('C-039 emas batangan → NOT_FOUND', searchChatAhsp('harga emas batangan per gram').outcome === 'NOT_FOUND');
check('C-040 teleportasi material → NOT_FOUND', searchChatAhsp('pekerjaan teleportasi material').outcome === 'NOT_FOUND');
check('C-014 jaga: dynabolt m10 tetap FOUND_PARTIAL', searchChatAhsp('dynabolt m10').outcome === 'FOUND_PARTIAL');
check('C-001 jaga: persiapan lahan tetap FOUND_PARTIAL', searchChatAhsp('pekerjaan persiapan lahan').outcome === 'FOUND_PARTIAL');
check('C-006 jaga: gudang material tetap FOUND_PARTIAL', searchChatAhsp('pekerjaan gudang material').outcome === 'FOUND_PARTIAL');
check('C-020 jaga: kawat las elektroda tetap FOUND_PARTIAL', searchChatAhsp('kawat las elektroda').outcome === 'FOUND_PARTIAL');
check('C-090 retrieval: jalan beton rigid → jalan-beton', searchConstructionKnowledge('jalan beton rigid')[0]?.record.id === 'jalan-beton');
check('C-091 retrieval: air bersih perpipaan → air-bersih', searchConstructionKnowledge('air bersih perpipaan')[0]?.record.id === 'air-bersih');
check('C-085 jaga: kolam renang → kolam-renang', searchConstructionKnowledge('kolam renang')[0]?.record.id === 'kolam-renang');

/* ------------------------------------------------------------------ */
/* Kelompok 7 — state lahan & atap lintas giliran (F-080…F-083)        */
/* ------------------------------------------------------------------ */
const ctx = (rawText: string): any => ({
  navigate: () => {}, rawText, currentMenu: 'dashboard',
  activeProject: null, projects: [], projectTotal: null,
});
const firstLine = (r: any) => String(r?.message ?? '').split('\n')[0];
for (const base of [
  'buatkan rab rumah 2 lantai 8x12 3 kamar tidur 2 kamar mandi',
  'buatkan rab rumah 1 lantai 6x10 2 kamar tidur 1 kamar mandi',
]) {
  executeIntent('CREATE_RAB_SUMMARY', undefined, ctx(base));
  const flLand = firstLine(continueRabNeeds('luas lahannya 500 m2'));
  check(`F-080/082 "${base.slice(18, 26)}…" lahan terbaca sebagai lahan`, flLand.includes('Luas lahan: 500 m²'), flLand);
  executeIntent('CREATE_RAB_SUMMARY', undefined, ctx(base));
  check(`F-081/083 "${base.slice(18, 26)}…" atap terlacak`, firstLine(continueRabNeeds('atapnya baja ringan')).includes('Atap: baja ringan'));
}
{
  const n = extractRabNeeds('luas lahannya 500 m2');
  check('F-080 parser: lahan posesif → landAreaM2, BUKAN buildingArea', n.landAreaM2 === 500 && n.buildingArea == null, `land=${n.landAreaM2} building=${n.buildingArea}`);
  const n2 = extractRabNeeds('atapnya baja ringan');
  check('F-081 parser: roofMaterial tercatat', n2.roofMaterial === 'baja ringan', `roof=${n2.roofMaterial}`);
}

/* ------------------------------------------------------------------ */
/* §6 — keamanan: tes negatif                                          */
/* ------------------------------------------------------------------ */
{
  // QTO: parameter tak dikenal DITOLAK (tidak dibuang diam-diam).
  const reg = CONSTRUCTION_TOOL_REGISTRY.find((e) => e.name === 'CalculateQTO');
  check('§6 registry: CalculateQTO terdaftar AVAILABLE', reg?.availability === 'AVAILABLE');
  const qtoOk = toolCalculateQto({ calculatorId: 'road.geometry', inputs: { panjang: 100, lebar: 6, tebalPerkerasan: 0.05, lebarBahu: 1 }, expectedUnit: 'm2' });
  check('§6 QTO kontrol positif: panggilan sah tetap bekerja (600 m²)', qtoOk.primaryQuantity === 600 && qtoOk.primaryUnit === 'm2');
  check('§6 QTO parameter asing ditolak eksplisit', throws(() => toolCalculateQto({ calculatorId: 'road.geometry', inputs: { panjang: 100, lebar: 6, tebalPerkerasan: 0.05, lebarBahu: 1, parameterNgawur: 3 } })));
  // QTO: input invalid (kalkulator tak terdaftar) ditolak.
  check('§6 QTO kalkulator tak terdaftar ditolak', throws(() => toolCalculateQto({ calculatorId: 'KALKULATOR-FIKTIF', inputs: {} })));
  // Dimensi invalid tidak menghasilkan QTO terverifikasi.
  check('§6 CalculateBuildingArea menolak dimensi ≤ 0', throws(() => toolCalculateBuildingArea({ widthM: -5, lengthM: 10 })));
  check('§6 dimensi invalid → tidak ada draft (needs-spec)', (buildUniversalDraft('buatkan rab gudang -5x10') as any).kind === 'needs-spec');
  // Harga hilang tidak menjadi Rp0.
  const disp = displayPriceStatus({ priceStatus: 'PRICE_UNRESOLVED', unitPrice: null } as any);
  check('§6 harga hilang tampil sebagai belum tersedia, bukan Rp0', /belum tersedia/i.test(disp.label) && !/Rp ?0\b/.test(disp.label), disp.label);
  // KB unverified tidak disajikan sebagai sumber resmi.
  const hits = searchConstructionKnowledge('gudang');
  check('§6 sitasi retrieval memuat status verifikasi record', hits.length > 0 && hits.every((h) => /status verifikasi:/.test(h.citation)), hits[0]?.citation ?? 'kosong');
  const ctxText = formatKnowledgeContext(hits);
  check('§6 konteks KB dilabeli bahan referensi (bukan kebenaran mutlak)', /bukan kebenaran mutlak/.test(ctxText));
  // Match ambigu tidak disajikan sebagai match terverifikasi.
  const broad = searchChatAhsp('kawat');
  check('§6 kueri ambigu luas → PARTIAL (bukan RELEVANT/terverifikasi)', broad.outcome === 'FOUND_PARTIAL', broad.outcome);
  // Struktur kritis tidak disertifikasi lapisan deterministik:
  // jembatan bentang besar wajib desain khusus, bukan draft template.
  const jb: any = buildUniversalDraft('buatkan rab jembatan beton bentang 60 meter');
  check('§6 jembatan bentang 60 m tidak disertifikasi dari template umum', jb.kind === 'needs-spec' && jb.missing.some((m: string) => /desain struktur khusus|perencana/i.test(m)), jb.kind);
}

/* ------------------------------------------------------------------ */
/* §3 — integrasi jalur produksi                                       */
/* ------------------------------------------------------------------ */
{
  // Penangkapan feedback benar-benar terhubung ke jalur produksi:
  // koreksi pengguna lewat continueRabNeeds menghasilkan peristiwa.
  clearFeedback();
  executeIntent('CREATE_RAB_SUMMARY', undefined, ctx('buatkan rab rumah 2 lantai 8x12 3 kamar tidur 2 kamar mandi'));
  continueRabNeeds('atapnya baja ringan');
  const evs = listFeedback();
  check('§3 feedback koreksi pengguna tertangkap dari jalur produksi', evs.some((e) => e.kind === 'user-correction' && e.stage === 'captured'), evs.map((e) => e.kind).join(','));
  clearFeedback();
  executeIntent('CREATE_RAB_DIRECT', undefined, ctx('teleportasi quantum dimensi lima'));
  check('§3 feedback permintaan tak terdukung tertangkap dari jalur produksi', listFeedback().some((e) => e.kind === 'unsupported-request'), listFeedback().map((e) => e.kind).join(','));
  clearFeedback();
  // missingInformation dari IR sampai ke pesan klarifikasi produksi.
  const u = understandProject('buatkan rab gudang');
  const assessment = assessBuildingMissingInfo(u, 'buatkan rab gudang');
  check('§3 IR missingInformation terisi label tier A yang memblokir', u.missingInformation.length > 0 && assessment.items.some((i) => i.blocksDraft), u.missingInformation.join(' | '));
  const ns: any = buildUniversalDraft('buatkan rab gudang');
  check('§3 kekurangan informasi tampil sebagai klarifikasi (bukan draft paksa)', ns.kind === 'needs-spec' && ns.missing.length > 0);
}

/* ------------------------------------------------------------------ */
/* FINISH-D — integrasi Workstream D (direktif FINISH 2026-11-08)      */
/* ------------------------------------------------------------------ */
{
  // F-D1: ValidationEngine kini menolak parameter asing DI AKARNYA
  // (bukan lagi hanya mitigasi wrapper).
  const vForeign = calculatorRegistry.validateInput('road.geometry', { panjang: 100, lebar: 6, tebalPerkerasan: 0.05, lebarBahu: 1, parameterNgawur: 3 });
  check('F-D1 registry: parameter asing → isValid=false', vForeign.isValid === false);
  check('F-D1 registry: error ERR_UNKNOWN_PARAMETER menyebut parameter asing', vForeign.errors.some((e) => e.code === 'ERR_UNKNOWN_PARAMETER' && /parameterNgawur/.test(e.message)), vForeign.errors.map((e) => e.code).join(','));
  const vClean = calculatorRegistry.validateInput('road.geometry', { panjang: 100, lebar: 6, tebalPerkerasan: 0.05, lebarBahu: 1 });
  check('F-D1 registry: input bersih tetap valid (tanpa positif palsu)', vClean.isValid === true, vClean.errors.map((e) => e.code).join(','));
  // Wrapper tetap menolak dengan konteks Bahasa Indonesia (tidak dobel-konflik).
  let wrapperMsg = '';
  try { toolCalculateQto({ calculatorId: 'road.geometry', inputs: { panjang: 100, lebar: 6, tebalPerkerasan: 0.05, lebarBahu: 1, parameterNgawur: 3 } }); } catch (e: any) { wrapperMsg = e?.message ?? ''; }
  check('F-D1 wrapper: pesan menyebut parameter asing + parameter sah', /parameterNgawur/.test(wrapperMsg) && /parameter yang dikenal/.test(wrapperMsg), wrapperMsg.slice(0, 120));

  // F-D2: toolCalculateQto terjangkau dari permukaan tool LLM produksi.
  check('F-D2 hitung_qto terdaftar di EZRAB_AI_TOOL_MAP', !!EZRAB_AI_TOOL_MAP['hitung_qto']);
  const qtoViaTool = runTool('hitung_qto', { kalkulator: 'road.geometry', parameter: { panjang: 100, lebar: 6, tebalPerkerasan: 0.05, lebarBahu: 1 }, satuan_hasil: 'm2' });
  check('F-D2 hitung_qto lewat runTool: 600 m² + provenance', typeof qtoViaTool === 'string' && /600/.test(qtoViaTool) && /m2/.test(qtoViaTool) && /Provenance:/.test(qtoViaTool), typeof qtoViaTool === 'string' ? qtoViaTool.slice(0, 120) : 'structured error');
  const qtoForeign = runTool('hitung_qto', { kalkulator: 'road.geometry', parameter: { panjang: 100, lebar: 6, tebalPerkerasan: 0.05, lebarBahu: 1, parameterNgawur: 3 } });
  check('F-D2 hitung_qto: parameter asing ditolak eksplisit lewat permukaan LLM', typeof qtoForeign === 'string' && /^ERROR:/.test(qtoForeign) && /parameterNgawur/.test(qtoForeign));
  const qtoUnit = runTool('hitung_qto', { kalkulator: 'road.geometry', parameter: { panjang: 100, lebar: 6 }, satuan_hasil: 'm3' });
  check('F-D2 hitung_qto: satuan tak kompatibel ditolak (tanpa konversi diam)', typeof qtoUnit === 'string' && /^ERROR:/.test(qtoUnit) && /satuan tidak kompatibel/.test(qtoUnit));
  const calcList = runTool('cari_kalkulator', { kata_kunci: 'road' });
  check('F-D2 cari_kalkulator memuat road.geometry', typeof calcList === 'string' && /road\.geometry/.test(calcList));

  // F-D3: retrieval terkabel ke permukaan tool LLM produksi, jujur status.
  check('F-D3 cari_pengetahuan_konstruksi terdaftar di EZRAB_AI_TOOL_MAP', !!EZRAB_AI_TOOL_MAP['cari_pengetahuan_konstruksi']);
  const kbHit = runTool('cari_pengetahuan_konstruksi', { kata_kunci: 'gudang' });
  check('F-D3 retrieval lewat runTool: hit + label referensi + status verifikasi', typeof kbHit === 'string' && /bukan kebenaran mutlak/.test(kbHit) && /status verifikasi: unverified/.test(kbHit), typeof kbHit === 'string' ? kbHit.slice(0, 140) : 'structured error');
  const kbMiss = runTool('cari_pengetahuan_konstruksi', { kata_kunci: 'zqxwv plumbus nirkabel' });
  check('F-D3 retrieval negatif dinyatakan eksplisit (di luar cakupan KB)', typeof kbMiss === 'string' && /di luar cakupan/.test(kbMiss), typeof kbMiss === 'string' ? kbMiss.slice(0, 120) : '');

  // F-D4: persistensi lokal feedback (MVP-1 storage layer, tidak
  // terpasang default): sink menulis salinan sesi ke storage lokal,
  // upsert per dedupeKey, tidak memajukan stage, dapat dihapus.
  clearLocalFeedbackEvents();
  clearFeedback();
  setFeedbackSink(createLocalFeedbackSink());
  const fev = captureFeedback('missing-knowledge', 'topik uji persistensi lokal', { sumber: 'F-D4' });
  captureFeedback('missing-knowledge', 'topik uji persistensi lokal', { sumber: 'F-D4' });
  setFeedbackSink(null);
  const stored = readLocalFeedbackEvents();
  check('F-D4 sink lokal: peristiwa tersimpan & ter-dedup (occurrences=2)', stored.length === 1 && stored[0].occurrences === 2, `stored=${stored.length} occ=${stored[0]?.occurrences}`);
  check('F-D4 sink lokal: stage tetap captured (tidak ada promosi otomatis)', stored[0]?.stage === 'captured' && stored[0]?.id === fev.id);
  clearLocalFeedbackEvents();
  check('F-D4 hak hapus: penyimpanan lokal kosong sesudah clear', readLocalFeedbackEvents().length === 0);
  clearFeedback();
}

console.log(`\nP0 REMEDIATION: ${pass + fail} asersi — PASS ${pass}, FAIL ${fail}`);
writeFileSync(
  join(process.env.TMPDIR ?? '/tmp', 'p0-remediation-results.json'),
  JSON.stringify({ pass, fail, failures }, null, 1)
);
process.exit(fail > 0 ? 1 : 0);

/**
 * EZRAB CHAT AI — GLOBAL INTENT-FIRST RAB FIX (Worker B, 2026-11-20).
 *
 * Tes level perintah/alur: spek diekstrak DULU, template dievaluasi
 * TERHADAP spek — nilai eksplisit pengguna tidak pernah ditimpa template.
 *
 * Kasus pemicu (laporan owner): "buatkan rab rumah dengan luas 100m2
 * luas bangunan 86m2 lengkap dari pondasi sampai atap. memakai atap
 * baja wf dan campuran baja ringan" — dulu diam-diam menjadi template
 * Rumah Type 70 (70 m²): angka lahan 100 dibaca sebagai luas bangunan,
 * luas bangunan eksplisit 86 diabaikan, dan kartu pilihan mengklaim
 * "Template: Rumah Type 70 — Dari Anda (tipe disebut di pesan)" padahal
 * pesan tidak pernah menyebut tipe.
 *
 * Delapan kelompok tes (sesuai penugasan):
 *  1. Repro: lahan 100, bangunan 86, tanpa Type 70, lantai/KT/KM/lokasi
 *     UNKNOWN, atap WF + baja ringan utuh.
 *  2. Luas eksplisit ≠ luas tipe: type 70 + 120 m² → dihitung 120 m².
 *  3. Beberapa template cocok: rekomendasi + alasan, spek tidak berubah
 *     (ikatan rumah 65 m²; ikatan universal gudang 500 m²; pemaksaan
 *     cold-storage gudang pendingin 500 m²).
 *  4. Tanpa template cocok: jalur kustom/universal, spek dipertahankan
 *     (gudang pendingin 800 m²; menara pandang bambu 3 lantai).
 *  5. Koreksi multi-turn: hanya field yang disebut yang berubah.
 *  6. Klarifikasi tidak pernah mengulang info yang sudah diberikan.
 *  7. DED: spek eksplisit dipertahankan lewat jalur intake DED.
 *  8. Gerbang persetujuan utuh: pratinjau + tombol push eksplisit,
 *     TRANSFER_DRAFT tanpa callback menolak jujur (tanpa penulisan).
 *
 * Catatan asersi: pesan RAB spek MENYEBUT basis parametrik "Tipe 70"
 * secara terbuka (basis perhitungan, bukan pemilihan template) — karena
 * itu "tanpa Type 70" diuji pada field terstruktur (sourceKind 'spec',
 * templateMatch null, displayLabel "Rumah Luas Bangunan 86 m²"), BUKAN
 * pada ketiadaan angka "70" di pesan.
 *
 * Jalankan: npx --yes tsx src/test/rabIntentFirstFlow.test.ts
 * (skrip asersi tsx polos — BUKAN vitest.)
 */
import { executeIntent, continueRabChoice } from '../ai-tools/ezrab-ai/actionRegistry';
import { getLastDirectRab } from '../ai-tools/ezrab-ai/directRab';
import { getLastUniversalDraft } from '../ai-tools/ezrab-ai/universalRab';
import {
  runRabIntentFlow, evaluateRabIntent, continueRabIntent,
  getLastRabIntentSpec, clearLastRabIntentSpec, buildSpecClarification,
} from '../ai-tools/ezrab-ai/rabIntentFlow';
import { extractRabIntentSpec, identifyMissingSpec } from '../ai-tools/ezrab-ai/rabIntentSpec';
import { EZRAB_AI_SYSTEM_PROMPT } from '../ai-tools/ezrab-ai/prompt';

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; failures.push(name); console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

const mockCtx = {
  navigate: () => {},
  currentMenu: 'ezrab-ai',
  activeProject: null,
  projects: [],
  projectTotal: null,
};
const ctxFor = (rawText: string) => ({ ...mockCtx, rawText }) as never;
const hasAction = (res: { actions?: Array<{ action: { kind: string } }> }, kind: string) =>
  (res.actions ?? []).some((a) => a.action.kind === kind);

const REPRO = 'buatkan rab rumah dengan luas 100m2 luas bangunan 86m2 lengkap dari pondasi sampai atap. memakai atap baja wf dan campuran baja ringan';

/* ------------------------------------------------------------------ */
/* 1 — Repro (jalur CREATE_RAB_DIRECT)                                 */
/* ------------------------------------------------------------------ */
console.log('== 1 — Repro: lahan 100, bangunan 86, tanpa Type 70 ==');
{
  clearLastRabIntentSpec();
  const res = executeIntent('CREATE_RAB_DIRECT', undefined, ctxFor(REPRO));
  const spec = getLastRabIntentSpec();
  const draft = getLastDirectRab();
  check('1.1 handler berhasil', res.ok === true);
  check('1.2 lahan 100 m²', spec?.landAreaM2 === 100, `dapat ${spec?.landAreaM2}`);
  check('1.3 bangunan 86 m²', spec?.buildingAreaM2 === 86, `dapat ${spec?.buildingAreaM2}`);
  check('1.4 lantai UNKNOWN', spec?.floors === null, `dapat ${spec?.floors}`);
  check('1.5 kamar tidur UNKNOWN', spec?.bedrooms === null, `dapat ${spec?.bedrooms}`);
  check('1.6 kamar mandi UNKNOWN', spec?.bathrooms === null, `dapat ${spec?.bathrooms}`);
  check('1.7 lokasi UNKNOWN', spec?.location === null, `dapat ${spec?.location}`);
  check('1.8 atap WF utuh', spec?.roofSystem.includes('baja WF') === true, `dapat ${JSON.stringify(spec?.roofSystem)}`);
  check('1.9 atap baja ringan utuh', spec?.roofSystem.includes('baja ringan') === true, `dapat ${JSON.stringify(spec?.roofSystem)}`);
  check('1.10 draf jalur spek (bukan template)', draft?.sourceKind === 'spec', `dapat ${draft?.sourceKind}`);
  check('1.11 templateMatch null', draft?.templateMatch == null);
  check('1.12 totalArea 86 (bukan 70, bukan 100)', draft?.totalArea === 86, `dapat ${draft?.totalArea}`);
  check('1.13 label "Rumah Luas Bangunan 86 m²"', draft?.displayLabel === 'Rumah Luas Bangunan 86 m²', `dapat ${draft?.displayLabel}`);
  check('1.14 pesan tanpa klaim kartu "Template: Rumah Type 70"', !res.message.includes('Template: Rumah Type 70'));
  check('1.15 pesan memuat atap WF + baja ringan', res.message.includes('baja WF') && res.message.includes('baja ringan'));
  check('1.16 pesan memuat blok provenance "Asal nilai"', res.message.includes('**Asal nilai**'));
  check('1.17 tombol Push ke Spreadsheet RAB ada', hasAction(res, 'push-rab'));
}

/* ------------------------------------------------------------------ */
/* 2 — Luas eksplisit ≠ luas tipe                                      */
/* ------------------------------------------------------------------ */
console.log('== 2 — type 70 + 120 m² → dihitung 120 m² ==');
{
  clearLastRabIntentSpec();
  const res = executeIntent('CREATE_RAB_DIRECT', undefined, ctxFor('RAB rumah type 70, luas bangunan 120 m2'));
  const draft = getLastDirectRab();
  check('2.1 handler berhasil', res.ok === true);
  check('2.2 totalArea 120 (template tidak me-reset ke 70)', draft?.totalArea === 120, `dapat ${draft?.totalArea}`);
  check('2.3 sourceKind template (teradaptasi, bukan spek bebas)', draft?.sourceKind === 'template', `dapat ${draft?.sourceKind}`);
  check('2.4 areaAdaptation {120, 70}', draft?.areaAdaptation?.requestedArea === 120 && draft?.areaAdaptation?.typeArea === 70,
    `dapat ${JSON.stringify(draft?.areaAdaptation)}`);
  check('2.5 pesan memuat luas total 120 m² + provenance dari Anda',
    res.message.includes('luas total ±120 m²') && res.message.includes('Luas bangunan: 120 m² (total) — dari Anda'));
  check('2.6 spek bangunan 120', getLastRabIntentSpec()?.buildingAreaM2 === 120);
}

/* ------------------------------------------------------------------ */
/* 3 — Beberapa template cocok → rekomendasi, bukan pilihan diam-diam  */
/* ------------------------------------------------------------------ */
console.log('== 3 — Beberapa template cocok ==');
{
  // 3a. Ikatan rumah 65 m² → kartu + rekomendasi T70, alternatif T60.
  clearLastRabIntentSpec();
  const card = executeIntent('CREATE_RAB_DIRECT', undefined, ctxFor('buatkan rab rumah luas bangunan 65 m2'));
  const spec3a = getLastRabIntentSpec();
  check('3.1 kartu tampil (bukan tabel langsung)', !hasAction(card, 'push-rab') && card.message.includes('Pilih cara membuat RAB-nya'));
  check('3.2 rekomendasi tampil', card.message.includes('**Rekomendasi: Pakai Template**'));
  check('3.3 rekomendasi menamai Type 70', card.message.includes('Type 70'));
  check('3.4 alternatif Type 60 disebutkan', card.message.includes('Type 60'));
  check('3.5 label luas jujur (65 m² — Dari Anda, bukan luas tipe)', card.message.includes('Luas bangunan: 65 m² — Dari Anda'));
  check('3.6 tanpa klaim palsu "tipe disebut di pesan"', !card.message.includes('tipe disebut di pesan'));
  check('3.7 spek bangunan tetap 65', spec3a?.buildingAreaM2 === 65, `dapat ${spec3a?.buildingAreaM2}`);

  // 3b. Ikatan universal gudang 500 m² → rekomendasi + alternatif.
  const uni = evaluateRabIntent('buatkan rab gudang 500 m2');
  check('3.8 rute universal', uni.route === 'universal', `dapat ${uni.route}`);
  check('3.9 rekomendasi menamai template', (uni.recommendation?.templateName ?? '').length > 0,
    `dapat ${uni.recommendation?.templateName}`);
  check('3.10 alasan rekomendasi ada', (uni.recommendation?.reasons.length ?? 0) > 0);
  check('3.11 alternatif ikatan dicantumkan', (uni.recommendation?.alternatives?.length ?? 0) > 0);
  check('3.12 spek bangunan tetap 500', uni.spec.buildingAreaM2 === 500);

  // 3c. Gudang pendingin 500 m² → rekomendasi + paksa cold-storage.
  const cold = evaluateRabIntent('buatkan rab gudang pendingin 500 m2');
  check('3.13 rekomendasi cold-storage', cold.recommendation?.templateId === 'BLD-IND-COLDSTORAGE',
    `dapat ${cold.recommendation?.templateId}`);
  check('3.14 template dipaksa (satu cakupan)', cold.forcedTemplateId === 'BLD-IND-COLDSTORAGE',
    `dapat ${cold.forcedTemplateId}`);

  // 3d. Jalur live (CREATE_RAB_SUMMARY): draf benar memakai cold-storage.
  const live = executeIntent('CREATE_RAB_SUMMARY', undefined, ctxFor('buatkan rab gudang pendingin 500 m2'));
  const draftUni = getLastUniversalDraft();
  check('3.15 draf universal terbentuk', hasAction(live, 'push-universal'));
  check('3.16 part draf memakai BLD-IND-COLDSTORAGE',
    draftUni?.parts.some((p) => p.template.id === 'BLD-IND-COLDSTORAGE') === true,
    `dapat ${draftUni?.parts.map((p) => p.template.id).join(', ')}`);
}

/* ------------------------------------------------------------------ */
/* 4 — Tanpa template cocok → kustom, spek dipertahankan                */
/* ------------------------------------------------------------------ */
console.log('== 4 — Tanpa template cocok ==');
{
  const cold800 = evaluateRabIntent('RAB gudang pendingin 800 m2, struktur baja, dinding sandwich panel');
  check('4.1 gudang pendingin 800 → rute universal (bukan template rumah)', cold800.route === 'universal', `dapat ${cold800.route}`);
  check('4.2 tanpa templateMatch rumah', cold800.templateMatch === null);
  check('4.3 bangunan 800 dipertahankan', cold800.spec.buildingAreaM2 === 800, `dapat ${cold800.spec.buildingAreaM2}`);
  check('4.4 struktur baja dipertahankan', cold800.spec.structuralSystem.includes('baja'), `dapat ${JSON.stringify(cold800.spec.structuralSystem)}`);

  const tower = evaluateRabIntent('RAB menara pandang bambu 3 lantai di tepi danau');
  check('4.5 menara pandang → rute custom', tower.route === 'custom', `dapat ${tower.route}`);
  check('4.6 tanpa templateMatch', tower.templateMatch === null);
  check('4.7 lantai 3 dipertahankan', tower.spec.floors === 3, `dapat ${tower.spec.floors}`);
  // 'bambu' belum ada di daftar material ekstraktor (observasi untuk
  // Worker A) — preservasi material diuji pada 'kayu' yang dikenal.
  const towerKayu = evaluateRabIntent('RAB menara pandang kayu 3 lantai di tepi danau');
  check('4.8 material kayu dipertahankan', towerKayu.spec.materials.includes('kayu'), `dapat ${JSON.stringify(towerKayu.spec.materials)}`);

  clearLastRabIntentSpec();
  const res = executeIntent('CREATE_RAB_DIRECT', undefined, ctxFor('RAB menara pandang bambu 3 lantai di tepi danau'));
  check('4.9 tanpa tombol push-rab (tidak ada template dipaksa)', !hasAction(res, 'push-rab'));
  check('4.10 spek lantai 3 tersimpan', getLastRabIntentSpec()?.floors === 3);
}

/* ------------------------------------------------------------------ */
/* 5 — Koreksi multi-turn: hanya field yang disebut berubah            */
/* ------------------------------------------------------------------ */
console.log('== 5 — Koreksi multi-turn ==');
{
  clearLastRabIntentSpec();
  const t1 = runRabIntentFlow(REPRO);
  check('5.1 giliran 1: rute spec', t1.evaluation.route === 'spec', `dapat ${t1.evaluation.route}`);
  const t2 = continueRabIntent('lantainya 2');
  check('5.2 giliran 2: lantai = 2', t2.spec.floors === 2, `dapat ${t2.spec.floors}`);
  check('5.3 giliran 2: lahan tetap 100', t2.spec.landAreaM2 === 100);
  check('5.4 giliran 2: bangunan tetap 86', t2.spec.buildingAreaM2 === 86);
  check('5.5 giliran 2: atap tetap WF + baja ringan',
    t2.spec.roofSystem.includes('baja WF') && t2.spec.roofSystem.includes('baja ringan'));
  check('5.6 giliran 2: lokasi tetap UNKNOWN', t2.spec.location === null);
  const t3 = continueRabIntent('lokasi di Malang');
  check('5.7 giliran 3: lokasi Malang', t3.spec.location === 'Malang', `dapat ${t3.spec.location}`);
  check('5.8 giliran 3: lantai tetap 2', t3.spec.floors === 2);
  check('5.9 giliran 3: bangunan tetap 86', t3.spec.buildingAreaM2 === 86);
  check('5.10 giliran 3: atap tetap utuh',
    t3.spec.roofSystem.includes('baja WF') && t3.spec.roofSystem.includes('baja ringan'));

  // 5b. Koreksi lewat kartu pilihan (registry): lantai → kartu diperbarui;
  //     koreksi atap → template gugur, alih ke jalur spek (bukan kartu).
  executeIntent('CREATE_RAB_DIRECT', undefined, ctxFor('buatkan rab rumah luas bangunan 65 m2'));
  const corr1 = continueRabChoice('lantainya 2');
  check('5.11 koreksi lantai → kartu diperbarui (bukan tabel)', !hasAction(corr1, 'push-rab') && corr1.message.includes('Pilih cara membuat RAB-nya'));
  check('5.12 kartu memuat lantai 2', /Jumlah lantai: 2 lantai/.test(corr1.message), corr1.message.split('\n').find((l) => l.includes('lantai')) ?? '(tanpa baris lantai)');
  const corr2 = continueRabChoice('atapnya baja ringan');
  check('5.13 koreksi atap → alih ke spek (tombol push-rab)', hasAction(corr2, 'push-rab'));
  check('5.14 penjelasan pengalihan tampil', corr2.message.includes('bukan parameter template'));
  check('5.15 draf hasil koreksi jalur spek', getLastDirectRab()?.sourceKind === 'spec', `dapat ${getLastDirectRab()?.sourceKind}`);
  check('5.16 spek atap terkoreksi tersimpan', getLastRabIntentSpec()?.roofSystem.includes('baja ringan') === true);
  check('5.17 spek bangunan tetap 65 sesudah koreksi', getLastRabIntentSpec()?.buildingAreaM2 === 65);
}

/* ------------------------------------------------------------------ */
/* 6 — Klarifikasi tidak pernah mengulang info yang sudah diberikan    */
/* ------------------------------------------------------------------ */
console.log('== 6 — Klarifikasi tidak mengulang ==');
{
  const reproSpec = extractRabIntentSpec(REPRO);
  check('6.1 repro: tanpa klarifikasi (basis sudah ada)', buildSpecClarification(reproSpec) === null);
  const missing = identifyMissingSpec(reproSpec);
  check('6.2 missing tanpa lahan', !missing.includes('landAreaM2'));
  check('6.3 missing tanpa bangunan', !missing.includes('buildingAreaM2'));
  check('6.4 missing tanpa atap', !missing.includes('roofSystem'));
  check('6.5 missing tanpa lingkup', !missing.includes('scope'));
  const roofOnly = extractRabIntentSpec('buatkan rab rumah, atap baja ringan');
  const q = buildSpecClarification(roofOnly);
  check('6.6 tanpa basis → ada pertanyaan', q !== null);
  check('6.7 pertanyaan soal luas bangunan/dimensi', q?.includes('luas bangunan') === true, q ?? '(null)');
  check('6.8 pertanyaan TIDAK mengulang atap', q?.includes('atap') === false && q?.includes('baja ringan') === false, q ?? '(null)');

  clearLastRabIntentSpec();
  const res = executeIntent('CREATE_RAB_DIRECT', undefined, ctxFor('buatkan rab rumah'));
  check('6.9 tanpa basis → awaitRabNeeds', res.awaitRabNeeds === true);
  check('6.10 pertanyaan klarifikasi soal basis', res.message.includes('luas bangunan'));
}

/* ------------------------------------------------------------------ */
/* 7 — DED: spek eksplisit dipertahankan lewat intake DED              */
/* ------------------------------------------------------------------ */
console.log('== 7 — DED ==');
{
  clearLastRabIntentSpec();
  const dedText = 'buatkan rab rumah 2 lantai luas bangunan 120 m2 dari gambar ded ini, atap baja ringan';
  const res = executeIntent('CREATE_RAB_DIRECT', undefined, ctxFor(dedText));
  const spec = getLastRabIntentSpec();
  check('7.1 rute DED (navigasi ded-ai)', hasAction(res, 'navigate') &&
    (res.actions ?? []).some((a) => a.action.kind === 'navigate' && (a.action as { menu?: string }).menu === 'ded-ai'));
  check('7.2 pesan menyebut DED', res.message.includes('DED'));
  check('7.3 spek sumber ded', spec?.source === 'ded', `dapat ${spec?.source}`);
  check('7.4 bangunan 120 dipertahankan', spec?.buildingAreaM2 === 120);
  check('7.5 lantai 2 dipertahankan', spec?.floors === 2);
  check('7.6 atap baja ringan dipertahankan', spec?.roofSystem.includes('baja ringan') === true);
  check('7.7 pesan mencantumkan spek yang tetap berlaku', res.message.includes('tetap berlaku') && res.message.includes('120 m²'));

  // 7b. DED-first di CREATE_RAB_SUMMARY: draf template tidak menelan DED.
  clearLastRabIntentSpec();
  const resSum = executeIntent('CREATE_RAB_SUMMARY', undefined, ctxFor('buatkan rab rumah dari gambar ded ini luas bangunan 90 m2'));
  check('7.8 SUMMARY DED → handoff DED Estimate AI', resSum.message.includes('DED Estimate AI'));
  check('7.9 SUMMARY DED tanpa draf universal', !hasAction(resSum, 'push-universal'));
  check('7.10 SUMMARY DED spek bangunan 90', getLastRabIntentSpec()?.buildingAreaM2 === 90);
}

/* ------------------------------------------------------------------ */
/* 8 — Gerbang persetujuan utuh                                        */
/* ------------------------------------------------------------------ */
console.log('== 8 — Gerbang persetujuan ==');
{
  clearLastRabIntentSpec();
  const flow = runRabIntentFlow(REPRO);
  check('8.1 flow membangun draf pratinjau', flow.built !== null);
  check('8.2 draf tersimpan sebagai pratinjau (bukan ter-commit)', getLastDirectRab() === flow.built);
  const res = executeIntent('CREATE_RAB_DIRECT', undefined, ctxFor(REPRO));
  check('8.3 tombol persetujuan eksplisit push-rab', hasAction(res, 'push-rab'));
  // TRANSFER_DRAFT tanpa callback pratinjau → menolak jujur, tanpa tulis.
  const transfer = executeIntent('TRANSFER_DRAFT', undefined, ctxFor(''));
  check('8.4 TRANSFER_DRAFT tanpa callback → ok:false', transfer.ok === false);
  check('8.5 draf pratinjau tetap ada sesudah penolakan', getLastDirectRab() !== null);
}

/* ------------------------------------------------------------------ */
/* Prompt: aturan 32 (intent-first)                                    */
/* ------------------------------------------------------------------ */
console.log('== Prompt — aturan 32 ==');
{
  check('P.1 prompt memuat aturan 32 URUTAN INTENT RAB', EZRAB_AI_SYSTEM_PROMPT.includes('URUTAN INTENT RAB'));
  check('P.2 prompt di bawah batas gateway 20.000', EZRAB_AI_SYSTEM_PROMPT.length < 20_000,
    `${EZRAB_AI_SYSTEM_PROMPT.length} karakter`);
}

console.log(`\n${failed === 0 ? 'SEMUA TES INTENT-FIRST RAB LULUS' : 'ADA TES GAGAL'} — lulus ${passed}, gagal ${failed}`);
if (failures.length) console.log('Gagal:', failures.join(' | '));
process.exit(failed === 0 ? 0 : 1);

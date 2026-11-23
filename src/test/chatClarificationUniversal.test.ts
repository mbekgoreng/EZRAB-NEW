/**
 * W6 — Klarifikasi adaptif per disiplin (§6 Universal Construction
 * Intelligence, 2026-11-22).
 *
 * Cakupan:
 *  1. State menunggu needs-spec jalur cepat (S1-R1): jembatan tanpa
 *     bentang + jalan tanpa panjang → needs-spec MENYETEL konteks
 *     menunggu; jawaban susulan ("bentang 12 m" / "panjang 2 km")
 *     melanjutkan intake (bukan UNKNOWN/LLM).
 *  2. Keluarga kuesioner baru: MEP, jembatan, irigasi, pelabuhan,
 *     sanitasi, struktur — definisi ada + isSatisfied benar + tidak
 *     bocor ke disiplin lain (rumah tidak ditanya soal jembatan).
 *     Termasuk: cakupan SPEC_KEY_META (cermin S7), apply → derive →
 *     validasi spek terstruktur, dan frasa generate yang bebas kata
 *     kunci scope lain (tidak menambah scope liar ke draf).
 *  3. criticalFieldsFor per disiplin + buildSpecClarification adaptif
 *     (jalan ditanya panjang+lebar, bukan luas bangunan).
 *  4. Pola router teks RAB_FULL_AI ("full ai" / "ai full" /
 *     "susun pakai ai") + pin non-regresi rute RAB lain.
 *  5. Teks `custom` jujur (G11-teks): tidak menjanjikan builder kustom.
 *  6. continueRabIntent aktif di jalur koreksi ringkasan; kartu
 *     pilihan SENGAJA tetap memakai merge basis-kartu (bukan
 *     continueRabIntent) — dipin alasannya.
 *
 * Jalankan: npx --yes tsx src/test/chatClarificationUniversal.test.ts
 * (skrip asersi tsx polos — BUKAN vitest.)
 */
import {
  executeIntent, tryContinueUniversalContext, getUniversalContextState,
  clearUniversalContext, clearProjectContext, clearPendingRabChoice,
  continueRabNeeds, continueRabChoice,
} from '../ai-tools/ezrab-ai/actionRegistry';
import { routeIntent } from '../ai-tools/ezrab-ai/intentRouter';
import { extractUniversalContext } from '../ai-tools/ezrab-ai/universalIntake';
import {
  selectQuestionnaireQuestions, applyQuestionnaireAnswers,
  deriveStructuredSpecs, questionnaireDefKeys, questionnaireGeneratePhrases,
} from '../ai-tools/ezrab-ai/questionnaire';
import {
  criticalFieldsFor, disciplineForSpec, buildSpecClarification,
  evaluateRabIntent, continueRabIntent,
  getLastRabIntentSpec, clearLastRabIntentSpec, setLastRabIntentSpec,
} from '../ai-tools/ezrab-ai/rabIntentFlow';
import { extractRabIntentSpec } from '../ai-tools/ezrab-ai/rabIntentSpec';
import { SPEC_KEY_META, validateStructuredSpecs } from '../ai-tools/ezrab-ai/structuredSpec';
import { detectScopes } from '../ai-tools/ezrab-ai/universalRab';

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
const start = (text: string) =>
  executeIntent(routeIntent(text).intent as never, undefined, ctxFor(text));
const qKeys = (text: string) =>
  selectQuestionnaireQuestions(extractUniversalContext(text)).map((q) => q.key);

function resetFlow(): void {
  clearUniversalContext();
  clearProjectContext();
  clearPendingRabChoice();
  clearLastRabIntentSpec();
}

/* ------------------------------------------------------------------ */
/* 1 — needs-spec jalur cepat menyetel state menunggu (S1-R1)           */
/* ------------------------------------------------------------------ */
console.log('== 1 — needs-spec → jawaban susulan melanjutkan intake ==');
{
  // Kontrafaktual: tanpa state menunggu, jawaban susulan jatuh ke LLM.
  check('1.1 "bentang 12 m" tanpa konteks = UNKNOWN (jatuh ke LLM)',
    routeIntent('bentang 12 m').intent === 'UNKNOWN');
  check('1.2 "panjang 2 km" tanpa konteks = UNKNOWN (jatuh ke LLM)',
    routeIntent('panjang 2 km').intent === 'UNKNOWN');

  // Kasus jembatan: panjang ada, bentang TIDAK ada → gerbang melepas
  // (lengthM memenuhi syarat lepas subtype) tetapi builder butuh bentang
  // (primaryMeasure 'span' hanya dipenuhi spanM) → needs-spec.
  resetFlow();
  const b1 = start('buatkan rab jembatan panjang 50 m');
  check('1.3 jembatan tanpa bentang → needs-spec menunggu jawaban',
    b1.awaitProjectConcept === true, `await=${b1.awaitProjectConcept}`);
  check('1.4 pesan needs-spec menyebut bentang yang hilang',
    b1.message.includes('bentang'));
  check('1.5 pesan needs-spec TIDAK lagi menyuruh kirim ulang lengkap',
    !b1.message.includes('Kirim ulang permintaan lengkap'));
  const bCtx = getUniversalContextState();
  check('1.6 universalCtx tersetel (primer jembatan, bentang null)',
    bCtx?.primary?.id === 'jembatan' && bCtx?.spanM == null && bCtx?.lengthM === 50,
    `primer=${bCtx?.primary?.id} span=${bCtx?.spanM} length=${bCtx?.lengthM}`);
  const b2 = tryContinueUniversalContext('bentang 12 m');
  check('1.7 jawaban "bentang 12 m" ditangkap intake (bukan null/LLM)',
    b2 !== null);
  check('1.8 bentang 12 m tergabung ke konteks',
    getUniversalContextState()?.spanM === 12);
  check('1.9 intake melanjutkan: pertanyaan berikutnya = lebar jembatan',
    (b2?.message ?? '').includes('lebar jembatan'),
    (b2?.message ?? '').slice(0, 120));
  check('1.10 status menunggu tetap hidup sesudah jawaban susulan',
    b2?.awaitProjectConcept === true);
  const b3 = b2 ? tryContinueUniversalContext('lebar 7 m') : null;
  check('1.11 giliran ketiga berlanjut: ditanya tipe konstruksi',
    (b3?.message ?? '').includes('beton') && (b3?.message ?? '').includes('baja'),
    (b3?.message ?? '').slice(0, 120));

  // Kasus jalan: tanpa panjang SAMA SEKALI → gerbang subtype melepas
  // (subtipe belum dikenal), builder butuh panjang → needs-spec.
  resetFlow();
  const j1 = start('buatkan rab jalan');
  check('1.12 jalan tanpa panjang → needs-spec menunggu jawaban',
    j1.awaitProjectConcept === true, `await=${j1.awaitProjectConcept}`);
  check('1.13 pesan needs-spec jalan menyebut panjang yang hilang',
    j1.message.includes('panjang'));
  const jCtx = getUniversalContextState();
  check('1.14 universalCtx jalan tersetel (panjang null)',
    jCtx?.primary?.id === 'jalan' && jCtx?.lengthM == null,
    `primer=${jCtx?.primary?.id} length=${jCtx?.lengthM}`);
  const j2 = tryContinueUniversalContext('panjang 2 km');
  check('1.15 jawaban "panjang 2 km" ditangkap intake (bukan null/LLM)',
    j2 !== null);
  check('1.16 panjang 2 km = 2000 m tergabung ke konteks',
    getUniversalContextState()?.lengthM === 2000);
  check('1.17 intake melanjutkan: pertanyaan berikutnya = lebar jalan',
    (j2?.message ?? '').includes('lebar jalan'),
    (j2?.message ?? '').slice(0, 120));
}

/* ------------------------------------------------------------------ */
/* 2 — Keluarga kuesioner baru                                         */
/* ------------------------------------------------------------------ */
console.log('== 2 — Keluarga kuesioner baru ==');
{
  const NEW_KEYS = [
    'mep-installation-type', 'mep-power-capacity', 'mep-points',
    'bridge-span', 'bridge-width', 'bridge-structure-type', 'bridge-foundation',
    'bridge-traffic', 'bridge-pedestrian',
    'irrigation-length', 'irrigation-channel-size', 'irrigation-channel-type',
    'irrigation-structures',
    'harbor-structure-type', 'harbor-function', 'harbor-material',
    'sanitation-system-type', 'sanitation-units', 'sanitation-disposal',
    'structure-system', 'structure-concrete-grade',
  ];
  // Cermin S7 (vitest) dalam tsx: 29 kunci lama + 21 kunci W6 = 50 def,
  // 39 META lama + 21 = 60 META; tanpa kunci yatim.
  check('2.1 jumlah definisi kuesioner = 50 (29 lama + 21 baru)',
    questionnaireDefKeys().length === 50, `dapat ${questionnaireDefKeys().length}`);
  const missingMeta = questionnaireDefKeys().filter((k) => !(k in SPEC_KEY_META));
  check('2.2 semua kunci definisi ada di SPEC_KEY_META',
    missingMeta.length === 0, `yatim: ${missingMeta.join(', ')}`);
  check('2.3 jumlah entri SPEC_KEY_META = 60',
    Object.keys(SPEC_KEY_META).length === 60, `dapat ${Object.keys(SPEC_KEY_META).length}`);
  const families = new Set(Object.values(SPEC_KEY_META).map((m) => m.family));
  check('2.4 family META tetap 12 (pin P3D §0.3 — kunci baru memakai ulang family)',
    families.size === 12, `dapat ${families.size}: ${[...families].join(', ')}`);

  // MEP: ketiga kunci muncul untuk primer MEP generik; jenis instalasi
  // tidak ditanya ulang bila sudah disebut di teks.
  const mepKeys = qKeys('buatkan rab mep gedung');
  check('2.5 MEP: jenis instalasi + daya + titik ditanyakan',
    mepKeys.includes('mep-installation-type') && mepKeys.includes('mep-power-capacity') && mepKeys.includes('mep-points'),
    mepKeys.join(', '));
  const listrikKeys = qKeys('buatkan rab instalasi listrik 500 m2');
  check('2.6 MEP: jenis instalasi TIDAK ditanya ulang bila sudah disebut',
    !listrikKeys.includes('mep-installation-type') && listrikKeys.includes('mep-power-capacity') && listrikKeys.includes('mep-points'),
    listrikKeys.join(', '));

  // Jembatan: bentang+lebar ditanya bila belum ada; tidak ditanya bila ada.
  const bridgeKeys = qKeys('buatkan rab jembatan');
  check('2.7 jembatan: keenam kunci ditanyakan bila belum ada data',
    ['bridge-span', 'bridge-width', 'bridge-structure-type', 'bridge-foundation', 'bridge-traffic', 'bridge-pedestrian']
      .every((k) => bridgeKeys.includes(k)),
    bridgeKeys.join(', '));
  const bridgeFullKeys = qKeys('buatkan rab jembatan bentang 12 m lebar 7 m');
  check('2.8 jembatan: bentang+lebar TIDAK ditanya ulang bila sudah ada',
    !bridgeFullKeys.includes('bridge-span') && !bridgeFullKeys.includes('bridge-width')
    && bridgeFullKeys.includes('bridge-structure-type') && bridgeFullKeys.includes('bridge-foundation'),
    bridgeFullKeys.join(', '));

  // Irigasi: panjang ditanya bila belum ada; tipe+dimensi+struktur selalu.
  const irgKeys = qKeys('buatkan rab irigasi');
  check('2.9 irigasi: keempat kunci ditanyakan bila belum ada data',
    ['irrigation-length', 'irrigation-channel-size', 'irrigation-channel-type', 'irrigation-structures']
      .every((k) => irgKeys.includes(k)),
    irgKeys.join(', '));
  const irgLenKeys = qKeys('buatkan rab irigasi panjang 800 m');
  check('2.10 irigasi: panjang TIDAK ditanya ulang bila sudah ada',
    !irgLenKeys.includes('irrigation-length') && irgLenKeys.includes('irrigation-channel-size')
    && irgLenKeys.includes('irrigation-channel-type') && irgLenKeys.includes('irrigation-structures'),
    irgLenKeys.join(', '));

  // Pelabuhan: struktur tidak ditanya ulang bila sudah disebut (dermaga).
  const harborKeys = qKeys('buatkan rab pelabuhan panjang 100 m');
  check('2.11 pelabuhan: ketiga kunci ditanyakan',
    harborKeys.includes('harbor-structure-type') && harborKeys.includes('harbor-function') && harborKeys.includes('harbor-material'),
    harborKeys.join(', '));
  const dermagaKeys = qKeys('buatkan rab dermaga panjang 100 m');
  check('2.12 pelabuhan: struktur TIDAK ditanya ulang bila sudah disebut',
    !dermagaKeys.includes('harbor-structure-type') && dermagaKeys.includes('harbor-function'),
    dermagaKeys.join(', '));

  // Sanitasi: sistem+unit tidak ditanya ulang bila sudah disebut.
  const ipalKeys = qKeys('buatkan rab ipal');
  check('2.13 sanitasi: sistem TIDAK ditanya ulang (ipal sudah disebut), unit+buangan ditanya',
    !ipalKeys.includes('sanitation-system-type') && ipalKeys.includes('sanitation-units') && ipalKeys.includes('sanitation-disposal'),
    ipalKeys.join(', '));
  const septikKeys = qKeys('buatkan rab septic tank 40 sambungan');
  check('2.14 sanitasi: sistem+unit TIDAK ditanya ulang bila sudah disebut',
    !septikKeys.includes('sanitation-system-type') && !septikKeys.includes('sanitation-units') && septikKeys.includes('sanitation-disposal'),
    septikKeys.join(', '));

  // Struktur: sistem+mutu ditanya untuk beton; keduanya tidak relevan untuk baja.
  const betonKeys = qKeys('buatkan rab struktur beton');
  check('2.15 struktur: sistem+mutu beton ditanyakan',
    betonKeys.includes('structure-system') && betonKeys.includes('structure-concrete-grade'),
    betonKeys.join(', '));
  const bajaKeys = qKeys('buatkan rab struktur baja');
  check('2.16 struktur: sistem+mutu TIDAK ditanya untuk struktur baja',
    !bajaKeys.includes('structure-system') && !bajaKeys.includes('structure-concrete-grade'),
    bajaKeys.join(', '));
  const sysBajaCtx = extractUniversalContext('buatkan rab struktur beton');
  sysBajaCtx.answers['structure-system'] = 'Baja';
  const sysBajaKeys = selectQuestionnaireQuestions(sysBajaCtx).map((q) => q.key);
  check('2.17 struktur: mutu beton TIDAK ditanya bila sistemnya dijawab Baja',
    !sysBajaKeys.includes('structure-concrete-grade'), sysBajaKeys.join(', '));

  // Adaptivitas: rumah TIDAK mendapat satu pun pertanyaan disiplin lain.
  const houseKeys = qKeys('buatkan rab rumah 100 m2');
  check('2.18 rumah: TIDAK ada pertanyaan MEP/jembatan/irigasi/pelabuhan/sanitasi/struktur',
    NEW_KEYS.every((k) => !houseKeys.includes(k)), houseKeys.join(', '));
  const roadKeys = qKeys('buatkan rab jalan panjang 2 km lebar 7 m');
  check('2.19 jalan: TIDAK ada pertanyaan rumah/jembatan/irigasi (hanya keluarga jalan)',
    !roadKeys.some((k) => k.startsWith('bridge-') || k.startsWith('irrigation-') || k.startsWith('building-')),
    roadKeys.join(', '));

  // Apply → derive → validasi: jawaban kuesioner jembatan menjadi spek
  // terstruktur yang lolos validator (tanpa membuang spek lain).
  const bCtx = extractUniversalContext('buatkan rab jembatan');
  applyQuestionnaireAnswers(bCtx, {
    'bridge-span': { selectedIds: [], customText: '12 m', status: 'answered' },
    'bridge-structure-type': { selectedIds: ['jbt-rangka-baja'], customText: null, status: 'answered' },
    'bridge-foundation': { selectedIds: ['jbt-pond-borepile'], customText: null, status: 'answered' },
  });
  check('2.20 apply kuesioner: bentang teks "12 m" mengisi ctx.spanM = 12',
    bCtx.spanM === 12, `span=${bCtx.spanM}`);
  check('2.21 apply kuesioner: jawaban tercatat di ctx.answers',
    bCtx.answers['bridge-structure-type'] === 'Rangka baja'
    && bCtx.answers['bridge-foundation'] === 'Bore pile');
  const bSpecs = deriveStructuredSpecs(bCtx);
  const byKey = new Map(bSpecs.map((s) => [s.key, s]));
  check('2.22 derive: spek bridge-span/string "12 m" CONFIRMED (kind condition)',
    byKey.get('bridge-span')?.value === '12 m' && byKey.get('bridge-span')?.status === 'CONFIRMED'
    && byKey.get('bridge-span')?.kind === 'condition',
    JSON.stringify(byKey.get('bridge-span')));
  check('2.23 derive: spek struktur+pondasi CONFIRMED',
    byKey.get('bridge-structure-type')?.status === 'CONFIRMED'
    && byKey.get('bridge-foundation')?.status === 'CONFIRMED');
  check('2.24 derive: seluruh array spek lolos validateStructuredSpecs',
    validateStructuredSpecs(bSpecs) !== null);
  // Frasa generate bebas kata kunci scope lain (tidak menambah scope liar).
  const bPhrases = questionnaireGeneratePhrases(bCtx).join(' ');
  const bScopes = detectScopes(bPhrases).map((s) => s.id);
  check('2.25 frasa pondasi jembatan: "bore pile" diparafrasa jadi "tiang bor"',
    bPhrases.includes('tiang bor') && !bPhrases.toLowerCase().includes('bore pile'), bPhrases);
  check('2.26 frasa jembatan TIDAK menambah scope pondasi/drainase/jalan',
    !bScopes.includes('pondasi') && !bScopes.includes('drainase') && !bScopes.includes('jalan'),
    `scopes: ${bScopes.join(', ')} | frasa: ${bPhrases}`);

  // Frasa irigasi: 'pasangan batu'/'saluran' tidak boleh masuk teks generate.
  const iCtx = extractUniversalContext('buatkan rab irigasi');
  applyQuestionnaireAnswers(iCtx, {
    'irrigation-channel-type': { selectedIds: ['irg-tipe-batu'], customText: null, status: 'answered' },
  });
  const iPhrases = questionnaireGeneratePhrases(iCtx).join(' ');
  const iScopes = detectScopes(iPhrases).map((s) => s.id);
  check('2.27 frasa tipe irigasi: "pasangan batu" diparafrasa, tanpa kata "saluran"',
    iPhrases.includes('dinding batu kali') && !iPhrases.includes('pasangan batu') && !iPhrases.includes('saluran'),
    iPhrases);
  check('2.28 frasa irigasi TIDAK menambah scope drainase',
    !iScopes.includes('drainase'), `scopes: ${iScopes.join(', ')}`);

  // Frasa trotoar: kata "trotoar" (kunci scope jalan) tidak boleh masuk.
  const tCtx = extractUniversalContext('buatkan rab jembatan');
  applyQuestionnaireAnswers(tCtx, {
    'bridge-pedestrian': { selectedIds: ['jbt-trotoar-2'], customText: null, status: 'answered' },
  });
  const tPhrases = questionnaireGeneratePhrases(tCtx).join(' ');
  const tScopes = detectScopes(tPhrases).map((s) => s.id);
  check('2.29 frasa trotoar jembatan: tanpa kata "trotoar"/"pejalan kaki"',
    !tPhrases.includes('trotoar') && !tPhrases.includes('pejalan') && tPhrases.includes('fasilitas pedestrian'), tPhrases);
  check('2.30 frasa trotoar TIDAK menambah scope jalan',
    !tScopes.includes('jalan'), `scopes: ${tScopes.join(', ')}`);

  // Frasa lalu lintas: "pejalan kaki" mengandung substring "jalan".
  const lCtx = extractUniversalContext('buatkan rab jembatan');
  applyQuestionnaireAnswers(lCtx, {
    'bridge-traffic': { selectedIds: ['jbt-lalin-pejalan'], customText: null, status: 'answered' },
  });
  const lPhrases = questionnaireGeneratePhrases(lCtx).join(' ');
  const lScopes = detectScopes(lPhrases).map((s) => s.id);
  check('2.30b frasa lalu lintas: "pejalan kaki" diparafrasa jadi "pedestrian"',
    lPhrases.includes('pedestrian') && !lPhrases.includes('pejalan'), lPhrases);
  check('2.30c frasa lalu lintas TIDAK menambah scope jalan',
    !lScopes.includes('jalan'), `scopes: ${lScopes.join(', ')}`);

  // MEP titik: jawaban teks menjadi count terstruktur (angka + satuan).
  const mCtx = extractUniversalContext('buatkan rab mep gedung');
  applyQuestionnaireAnswers(mCtx, {
    'mep-points': { selectedIds: [], customText: '24 titik', status: 'answered' },
  });
  check('2.31 apply MEP: "24 titik" mengisi counts 24 titik',
    mCtx.counts.some((c) => c.value === 24 && c.unit === 'titik'),
    JSON.stringify(mCtx.counts));
  const mSpecs = deriveStructuredSpecs(mCtx);
  const mPoints = mSpecs.find((s) => s.key === 'mep-points');
  check('2.32 derive MEP: spek mep-points bernilai angka 24, satuan titik',
    mPoints?.value === 24 && mPoints?.unit === 'titik', JSON.stringify(mPoints));
  check('2.33 derive MEP: array spek lolos validator',
    validateStructuredSpecs(mSpecs) !== null);
}

/* ------------------------------------------------------------------ */
/* 3 — criticalFieldsFor + klarifikasi adaptif per disiplin             */
/* ------------------------------------------------------------------ */
console.log('== 3 — criticalFieldsFor + klarifikasi adaptif ==');
{
  const keysOf = (d: string) => criticalFieldsFor(d).map((f) => f.key);
  check('3.1 rumah: luas/dimensi',
    JSON.stringify(keysOf('rumah')) === JSON.stringify(['area', 'dimensions']),
    keysOf('rumah').join(', '));
  check('3.2 jalan: panjang+lebar',
    JSON.stringify(keysOf('jalan')) === JSON.stringify(['length', 'width']),
    keysOf('jalan').join(', '));
  check('3.3 jembatan: bentang+lebar',
    JSON.stringify(keysOf('jembatan')) === JSON.stringify(['span', 'width']),
    keysOf('jembatan').join(', '));
  check('3.4 irigasi: panjang+dimensi saluran',
    JSON.stringify(keysOf('irigasi')) === JSON.stringify(['length', 'channelDims']),
    keysOf('irigasi').join(', '));
  check('3.5 gudang: dimensi+bentang bebas+tinggi',
    JSON.stringify(keysOf('gudang')) === JSON.stringify(['dimensions', 'clearSpan', 'height']),
    keysOf('gudang').join(', '));
  check('3.6 disiplin tak dikenal → default luas/dimensi',
    JSON.stringify(keysOf('tidak-ada')) === JSON.stringify(['area', 'dimensions']));
  check('3.7 criticalFieldsFor mengembalikan salinan (tabel tidak termutasi)',
    (() => {
      const a = criticalFieldsFor('jalan');
      a.push({ key: 'rusak', label: 'rusak' });
      return criticalFieldsFor('jalan').length === 2;
    })());

  check('3.8 disciplineForSpec: jalan/jembatan/gudang/rumah/gedung',
    disciplineForSpec(extractRabIntentSpec('buatkan rab jalan')) === 'jalan'
    && disciplineForSpec(extractRabIntentSpec('buatkan rab jembatan')) === 'jembatan'
    && disciplineForSpec(extractRabIntentSpec('buatkan rab gudang')) === 'gudang'
    && disciplineForSpec(extractRabIntentSpec('buatkan rab rumah')) === 'rumah'
    && disciplineForSpec(extractRabIntentSpec('buatkan rab kantor')) === 'gedung');

  const qJalan = buildSpecClarification(extractRabIntentSpec('buatkan rab jalan'));
  check('3.9 jalan ditanya panjang+lebar (BUKAN luas bangunan)',
    qJalan != null && qJalan.includes('panjang') && qJalan.includes('lebar') && !qJalan.includes('luas bangunan'),
    qJalan ?? '(null)');
  const qJembatan = buildSpecClarification(extractRabIntentSpec('buatkan rab jembatan'));
  check('3.10 jembatan ditanya bentang+lebar (BUKAN luas bangunan)',
    qJembatan != null && qJembatan.includes('bentang') && qJembatan.includes('lebar') && !qJembatan.includes('luas bangunan'),
    qJembatan ?? '(null)');
  const qIrigasi = buildSpecClarification(extractRabIntentSpec('buatkan rab irigasi'));
  check('3.11 irigasi ditanya panjang+dimensi saluran (BUKAN luas bangunan)',
    qIrigasi != null && qIrigasi.includes('panjang') && qIrigasi.includes('dimensi saluran') && !qIrigasi.includes('luas bangunan'),
    qIrigasi ?? '(null)');
  const qGudang = buildSpecClarification(extractRabIntentSpec('buatkan rab gudang'));
  check('3.12 gudang ditanya dimensi+bentang bebas+tinggi',
    qGudang != null && qGudang.includes('dimensi') && qGudang.includes('bentang bebas') && qGudang.includes('tinggi'),
    qGudang ?? '(null)');
  const qRumah = buildSpecClarification(extractRabIntentSpec('buatkan rab rumah, atap baja ringan'));
  check('3.13 rumah tetap ditanya luas bangunan/dimensi (regresi perilaku lama)',
    qRumah != null && qRumah.includes('luas bangunan'),
    qRumah ?? '(null)');
  check('3.14 rumah TANPA pengulangan atap (regresi 6.8)',
    qRumah != null && !qRumah.includes('atap') && !qRumah.includes('baja ringan'),
    qRumah ?? '(null)');
  check('3.15 basis sudah ada → tanpa klarifikasi (regresi 6.1)',
    buildSpecClarification(extractRabIntentSpec('buatkan rab rumah luas bangunan 100 m2')) === null);
  check('3.16 sumber DED → tanpa klarifikasi',
    buildSpecClarification(extractRabIntentSpec('buatkan rab rumah dari gambar ded ini')) === null);
}

/* ------------------------------------------------------------------ */
/* 4 — Pola router teks RAB_FULL_AI                                    */
/* ------------------------------------------------------------------ */
console.log('== 4 — Routing teks RAB_FULL_AI ==');
{
  check('4.1 "buatkan rab full ai" → RAB_FULL_AI',
    routeIntent('buatkan rab full ai').intent === 'RAB_FULL_AI');
  check('4.2 "susun pakai ai" → RAB_FULL_AI',
    routeIntent('susun pakai ai').intent === 'RAB_FULL_AI');
  check('4.3 "susun rab dengan ai" → RAB_FULL_AI',
    routeIntent('susun rab dengan ai').intent === 'RAB_FULL_AI');
  check('4.4 "ai full untuk rab gudang" → RAB_FULL_AI',
    routeIntent('ai full untuk rab gudang').intent === 'RAB_FULL_AI');
  check('4.5 "full ai" mengalahkan DIRECT (pilihan jalur eksplisit)',
    routeIntent('buatkan rab rumah type 45 full ai').intent === 'RAB_FULL_AI');
  check('4.6 tanpa penanda full-ai: DIRECT tidak berubah',
    routeIntent('buatkan rab rumah type 45').intent === 'CREATE_RAB_DIRECT');
  check('4.7 tanpa penanda full-ai: SUMMARY tidak berubah',
    routeIntent('buatkan rab gudang 500 m2').intent === 'CREATE_RAB_SUMMARY');
  check('4.8 tanpa penanda full-ai: CLARIFY tidak berubah',
    routeIntent('buatkan rab').intent === 'CREATE_RAB_CLARIFY');
  check('4.9 "apa itu ai" TIDAK dirutekan ke RAB_FULL_AI',
    routeIntent('apa itu ai').intent !== 'RAB_FULL_AI',
    routeIntent('apa itu ai').intent);
}

/* ------------------------------------------------------------------ */
/* 5 — Teks `custom` jujur (G11-teks)                                  */
/* ------------------------------------------------------------------ */
console.log('== 5 — Teks custom jujur ==');
{
  const ev1 = evaluateRabIntent('buatkan rab menara pandang bambu 3 lantai');
  check('5.1 tanpa kategori dikenali → rute custom',
    ev1.route === 'custom', ev1.route);
  const reasons1 = ev1.recommendation.reasons.join(' ');
  check('5.2 teks custom: "Belum ada jalur hitung" + "ringkasan kebutuhan dulu"',
    reasons1.includes('Belum ada jalur hitung') && reasons1.includes('ringkasan kebutuhan'),
    reasons1);
  check('5.3 teks custom: TIDAK menjanjikan "jalur kustom"',
    !reasons1.includes('jalur kustom'), reasons1);
  const ev2 = evaluateRabIntent('buatkan rab lift 10 lantai');
  const reasons2 = ev2.recommendation.reasons.join(' ');
  check('5.4 kategori tanpa template (lift) → custom + teks jujur yang sama',
    ev2.route === 'custom' && reasons2.includes('Belum ada jalur hitung') && !reasons2.includes('jalur kustom'),
    `${ev2.route} | ${reasons2}`);
}

/* ------------------------------------------------------------------ */
/* 6 — continueRabIntent aktif; kartu pilihan tetap basis-kartu         */
/* ------------------------------------------------------------------ */
console.log('== 6 — continueRabIntent ==');
{
  resetFlow();
  setLastRabIntentSpec(extractRabIntentSpec('buatkan rab rumah luas bangunan 100 m2'));
  const ev = continueRabIntent('lantainya 2');
  check('6.1 continueRabIntent: koreksi lantai diterapkan',
    ev.spec.floors === 2, `lantai=${ev.spec.floors}`);
  check('6.2 continueRabIntent: field lain dipertahankan (bangunan 100)',
    ev.spec.buildingAreaM2 === 100, `bangunan=${ev.spec.buildingAreaM2}`);
  check('6.3 continueRabIntent: spek aktif tersimpan',
    getLastRabIntentSpec()?.floors === 2 && getLastRabIntentSpec()?.buildingAreaM2 === 100);
  clearLastRabIntentSpec();
  const evFresh = continueRabIntent('buatkan rab rumah 2 lantai');
  check('6.4 continueRabIntent tanpa spek aktif = permintaan baru',
    evFresh.spec.floors === 2, `lantai=${evFresh.spec.floors}`);

  // Jalur registry (site-1): koreksi lewat ringkasan memakai
  // continueRabIntent — hanya field yang disebut berubah.
  resetFlow();
  start('buatkan rab rumah');
  const r2 = continueRabNeeds('luas bangunan 120 m2');
  check('6.5 koreksi ringkasan: luas 120 tergabung via continueRabIntent',
    r2 !== null && getLastRabIntentSpec()?.buildingAreaM2 === 120,
    `area=${getLastRabIntentSpec()?.buildingAreaM2}`);
  check('6.6 koreksi ringkasan: jenis bangunan dipertahankan',
    getLastRabIntentSpec()?.buildingType === 'rumah',
    `type=${getLastRabIntentSpec()?.buildingType}`);

  // Kartu pilihan (site-2) SENGAJA bukan continueRabIntent: basis merge
  // adalah spek KARTU (65 m²), bukan spek aktif modul — buktinya: spek
  // aktif ditimpa 999 m², koreksi kartu tetap menghasilkan 65 m².
  resetFlow();
  executeIntent('CREATE_RAB_DIRECT', undefined, ctxFor('buatkan rab rumah luas bangunan 65 m2'));
  setLastRabIntentSpec(extractRabIntentSpec('buatkan rab rumah luas bangunan 999 m2'));
  const corr = continueRabChoice('lantainya 2');
  check('6.7 koreksi kartu memakai basis spek KARTU (65), bukan spek aktif (999)',
    getLastRabIntentSpec()?.buildingAreaM2 === 65,
    `area=${getLastRabIntentSpec()?.buildingAreaM2}`);
  check('6.8 koreksi kartu: lantai 2 diterapkan + kartu tetap tampil',
    getLastRabIntentSpec()?.floors === 2 && corr.message.includes('Pilih cara membuat RAB-nya'));
}

console.log(`\nchatClarificationUniversal: ${passed} lolos, ${failed} gagal${failures.length > 0 ? ` — gagal: ${failures.join('; ')}` : ''}`);
if (failed > 0) process.exitCode = 1;

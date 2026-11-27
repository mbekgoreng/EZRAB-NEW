/**
 * newProjectFlow — regresi end-to-end alur proyek baru (2026-11-26).
 *
 * Step 1 form (CreateProjectModal) -> Step 2 wizard 4 kartu ->
 * Step 3 Magic AI (sapaan + chip -> follow-up per kategori ->
 * ringkasan/brief -> draft) + D5 ask-back lewat prompt sintesis form.
 *
 * Gaya: skrip asersi tsx polos (BUKAN vitest), seperti
 * overBudgetAskBack.test.ts / d28VolumeCreate.test.ts — komponen React
 * TIDAK PERNAH dirender; perilaku UI dipin lewat readSrc (pola
 * finalFixes.test.ts), perilaku chat digerakkan lewat fungsi yang sama
 * dengan ketukan live (tryGreetingRabType = jalur submit saat
 * awaitingRabType aktif; continueRabNeeds / continueRabFinalize /
 * tryContinueUniversalContext / tryContinueProjectContext).
 *
 * Cakupan (tidak menduplikasi suite yang sudah ada — yang sudah dipin
 * di newProjectMagicPrompt / magicAiStep3 / newProjectGapsBCD hanya
 * dipakai ulang sebagai SATU titik sambung alur di sini):
 *  A. Validasi form: nama kosong memblokir Next (error inline);
 *     nama valid lanjut ke wizard; kesembilan field hadir; budget
 *     berlabel maksimal.
 *  B. Wizard: keempat kartu + routingnya (Magic AI -> rab-generator
 *     dengan greeting + id/nama proyek; Manual -> rab-estimasi;
 *     Volume -> qto-vc; Template -> template-rab TANPA membuat proyek
 *     dan TANPA membawa form — pin sebagai desain).
 *  C. Sapaan membawa nama proyek + budget-sebagai-maksimal; tanpa
 *     budget tidak ada rupiah karangan; entry membawa sapaan itu.
 *  D. Follow-up per kategori ditanya TEPAT SEKALI (keenam chip),
 *     urutan alur penuh: sapaan -> chip -> follow-up -> jawaban ->
 *     ringkasan/brief -> draft.
 *  E. Kondisi lahan/tapak: landscape ditanya tepat 1x; non-landscape
 *     (jembatan, alur chip) — LIHAT E.2: perilaku yang dispesifikasi
 *     (ditanya tepat 1x) TIDAK TERPENUHI; cek itu SENGAJA dibiarkan
 *     gagal dan didokumentasikan, bukan dilonggarkan.
 *  F. Ringkasan/brief SELALU mendahului tabel draft; tanpa
 *     ringkasan/brief tidak ada draft yang bisa disusun.
 *  G. D5 ask-back tetap jalan lewat alur baru: prompt sintesis form
 *     (budget maksimal) -> draft OVER -> 3 opsi, tanpa Push, draft
 *     belum final/tidak bisa ditransfer sampai dijawab.
 *
 * Jalankan: npx --yes tsx src/test/newProjectFlow.test.ts
 * (tanpa live AI, tanpa vite build.)
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'node:url';
import {
  buildNewProjectMagicPrompt,
  buildNewProjectGreeting,
  buildNewProjectGreetingSuggestions,
  type NewProjectFormInput,
} from '../ai-tools/ezrab-ai/newProjectMagicPrompt';
import {
  openEzrabAI,
  peekPendingEzrabAiEntry,
  peekPendingAiEntry,
  clearPendingAiEntry,
  clearPendingEzrabAiEntry,
} from '../ai-tools/aiNavigation';
import { routeIntent } from '../ai-tools/ezrab-ai/intentRouter';
import {
  executeIntent,
  tryContinueUniversalContext,
  tryContinueProjectContext,
  tryGreetingRabType,
  continueRabNeeds,
  continueRabFinalize,
  continueBudgetDecision,
  clearProjectContext,
  clearUniversalContext,
  getUniversalContextState,
  getLastRabNeeds,
  setLastRabNeeds,
  __clearPendingBudgetDecisionForTests,
  __getPendingBudgetDecisionForTests,
} from '../ai-tools/ezrab-ai/actionRegistry';
import {
  getLastUniversalDraft,
  clearLastUniversalDraft,
  overBudgetDecision,
  validateTransfer,
  buildPushPayload,
} from '../ai-tools/ezrab-ai/universalRab';
import { clearLastRabIntentSpec } from '../ai-tools/ezrab-ai/rabIntentFlow';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(__dirname, '..');
const readSrc = (rel: string): string => fs.readFileSync(path.join(srcRoot, rel), 'utf8');

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail?: unknown): void {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else {
    failed++; failures.push(name);
    console.log(`  ✗ ${name}${detail !== undefined ? ' — ' + String(detail) : ''}`);
  }
}
const count = (text: string, re: RegExp): number => (text.match(re) ?? []).length;

// Mock window untuk openEzrabAI (pola aiUnification.test.ts).
let lastUrl = '';
(global as unknown as { window: unknown }).window = {
  history: {
    pushState: (_s: unknown, _t: string, url: string) => { lastUrl = url; },
    replaceState: (_s: unknown, _t: string, url: string) => { lastUrl = url; },
  },
  dispatchEvent: () => true,
  addEventListener: () => {},
  removeEventListener: () => {},
};

const mockCtx = {
  navigate: () => {},
  currentMenu: 'ezrab-ai',
  activeProject: null,
  projects: [],
  projectTotal: null,
};
const ctxFor = (rawText: string) => ({ ...mockCtx, rawText }) as never;
type Res = {
  message: string; ok?: boolean; awaitRabNeeds?: boolean; awaitProjectConcept?: boolean;
  awaitBudgetDecision?: boolean;
  actions?: Array<{ label: string; action: { kind: string; intent?: string; param?: string } }>;
};
const exec = (text: string): Res =>
  executeIntent(routeIntent(text).intent as never, undefined, ctxFor(text)) as Res;
const hasAction = (res: Res, kind: string): boolean =>
  (res.actions ?? []).some((a) => a.action.kind === kind);
function reset(): void {
  clearProjectContext();
  clearUniversalContext();
  setLastRabNeeds(null);
  __clearPendingBudgetDecisionForTests();
  clearLastUniversalDraft();
  clearLastRabIntentSpec();
  clearPendingAiEntry();
  clearPendingEzrabAiEntry();
  lastUrl = '';
}

const FULL_FORM: NewProjectFormInput = {
  name: 'Rumah Tinggal 2 Lantai Modern',
  clientName: 'Bpk. Hendra',
  location: 'Jakarta Selatan',
  buildingType: 'Rumah Tinggal',
  buildingAreaM2: 120,
  landAreaM2: 240,
  floorCount: 2,
  maxBudgetRp: 850000000,
  startDate: '2026-12-01',
  notes: 'Akses jalan sempit, material diutamakan lokal.',
};

const modal = readSrc('components/projects/CreateProjectModal.tsx');
const workspace = readSrc('components/dashboard/WorkspaceView.tsx');
const dictionaries = readSrc('i18n/dictionaries.ts');

/* ------------------------------------------------------------------ */
/* A — Validasi form Step 1                                            */
/* ------------------------------------------------------------------ */
console.log('== A — Validasi form Step 1 ==');
{
  check('A.1 modal dibuka pada form (activeStep awal "manual")',
    modal.includes("useState<KickoffMethod>('manual')"));
  check('A.2 nama kosong -> error inline + Next diblokir (validateFormName gate)',
    modal.includes('if (!manualName.trim()) {') &&
    modal.includes("setFormNameError(t('proj.create.f_name_error'))") &&
    modal.includes('if (validateFormName()) setActiveStep(\'select\');'));
  check('A.3 error tampil inline (role=alert) + input required + aria-invalid',
    modal.includes('<p role="alert"') &&
    modal.includes('aria-invalid={!!formNameError}') &&
    modal.includes('{formNameError && ('));
  check('A.4 teks error: "Nama proyek wajib diisi sebelum lanjut."',
    dictionaries.includes("f_name_error: 'Nama proyek wajib diisi sebelum lanjut.'"));
  check('A.5 kesembilan field form hadir (nama, klien, kategori, luas bangunan, luas lahan, lantai, tanggal, budget, catatan)',
    ['f_name', 'f_client', 'f_type', 'f_area', 'f_land_area', 'f_floors', 'f_start_date', 'f_budget', 'f_notes']
      .every((k) => modal.includes(`t('proj.create.${k}')`)));
  check('A.6 budget berlabel maksimal: "Budget Maksimal (Batas Atas)"',
    dictionaries.includes("f_budget: 'Budget Maksimal (Batas Atas)'"));
  check('A.7 nama valid -> error dibersihkan + lanjut diizinkan (return true)',
    modal.includes('setFormNameError(null);') && modal.includes('return true;'));
}

/* ------------------------------------------------------------------ */
/* B — Wizard: keempat kartu + routing                                 */
/* ------------------------------------------------------------------ */
console.log('== B — Wizard 4 kartu + routing ==');
{
  check('B.1 keempat judul kartu: Magic AI / Manual RAB Builder / Volume Calculation / Template RAB Bangunan',
    dictionaries.includes("card1_t: 'EZRAB Magic AI'") &&
    dictionaries.includes("card2_t: 'Manual RAB Builder'") &&
    dictionaries.includes("card3_t: 'Volume Calculation'") &&
    dictionaries.includes("card4_t: 'Template RAB Bangunan'"));
  check('B.2 keempat kartu terpasang (Magic AI, Manual, Volume, Template)',
    modal.includes("onClick={() => setActiveStep('magic_ai')}") &&
    modal.includes("onClick={() => setActiveStep('manual')}") &&
    modal.includes('onClick={handleVolumeCalcPathway}') &&
    modal.includes('onClick={handleTemplatePathway}'));
  check('B.3 Magic AI: buat proyek dari form -> handler dengan id + nama + opsi sapaan',
    modal.includes("onOpenMagicAiWithPrompt(aiPrompt, newProj.id, newProj.name, magicOpenOptions())") &&
    modal.includes("buildProjectFromForm('magic_ai')"));
  check('B.4 Manual: buat proyek dari form -> rab-estimasi dengan id proyek baru',
    modal.includes("buildProjectFromForm('manual')") &&
    modal.includes("onNavigateToTab('rab-estimasi', newProj.id)"));
  check('B.5 Volume: buat proyek dari form -> qto-vc dengan id proyek baru',
    modal.includes("buildProjectFromForm('volume_calculation')") &&
    modal.includes("onNavigateToTab('qto-vc', newProj.id)"));
  const tplAt = modal.indexOf('const handleTemplatePathway');
  const tplBody = tplAt >= 0 ? modal.slice(tplAt, modal.indexOf('};', tplAt)) : '';
  check('B.6 Template: ke template-rab dengan projectId null (tanpa membuat proyek)',
    tplBody.includes("onNavigateToTab('template-rab', null)"));
  check('B.7 Template: form TIDAK dibawa (handler tanpa onCreateProject / buildProjectFromForm / manualName) — pin sebagai desain',
    tplAt >= 0 && !tplBody.includes('onCreateProject') && !tplBody.includes('buildProjectFromForm') && !tplBody.includes('manualName'));
  const wsAt = workspace.indexOf('onOpenMagicAiWithPrompt={');
  const wsBlock = wsAt >= 0 ? workspace.slice(wsAt, wsAt + 700) : '';
  check('B.8 WorkspaceView meneruskan greeting + saran ke openEzrabAI rab-generator',
    wsBlock.includes("mode: 'rab-generator'") &&
    wsBlock.includes('greeting: options?.greeting') &&
    wsBlock.includes('greetingSuggestions: options?.greetingSuggestions'));
}

/* ------------------------------------------------------------------ */
/* C — Sapaan membawa nama + budget-sebagai-maksimal                   */
/* ------------------------------------------------------------------ */
console.log('== C — Sapaan: nama + budget maksimal ==');
{
  const greeting = buildNewProjectGreeting(FULL_FORM);
  const prompt = buildNewProjectMagicPrompt(FULL_FORM);
  check('C.1 sapaan memakai nama + budget sebagai batas atas',
    greeting.includes('Rumah Tinggal 2 Lantai Modern') &&
    greeting.includes('Anggaran maksimal Rp850.000.000 akan saya jadikan batas atas'));
  check('C.2 prompt sintesis memakai nama + frasa anggaran maksimal yang sama',
    prompt.includes('Rumah Tinggal 2 Lantai Modern') &&
    prompt.includes('Anggaran maksimal Rp850.000.000.'));
  const noBudget = { ...FULL_FORM, maxBudgetRp: undefined };
  const greetingNoBudget = buildNewProjectGreeting(noBudget);
  const promptNoBudget = buildNewProjectMagicPrompt(noBudget);
  check('C.3 tanpa budget: sapaan + prompt tanpa angka rupiah karangan',
    greetingNoBudget.includes('Rumah Tinggal 2 Lantai Modern') &&
    !greetingNoBudget.includes('Anggaran maksimal') && !greetingNoBudget.includes('Rp') &&
    !promptNoBudget.includes('anggaran maksimal') && !promptNoBudget.includes('Rp'));
  reset();
  const suggestions = buildNewProjectGreetingSuggestions(FULL_FORM);
  openEzrabAI({
    mode: 'rab-generator', prompt, projectId: 'proj-flow-magic',
    projectName: 'Rumah Tinggal 2 Lantai Modern', source: 'create-project',
    greeting, greetingSuggestions: suggestions,
  });
  const entry = peekPendingEzrabAiEntry();
  check('C.4 entry rab-generator membawa sapaan + 6 chip + id/nama proyek yang sama dengan form',
    entry?.mode === 'rab-generator' &&
    entry?.ctx.greeting === greeting &&
    entry?.ctx.greetingSuggestions?.length === 6 &&
    entry?.ctx.projectId === 'proj-flow-magic' &&
    entry?.ctx.projectName === 'Rumah Tinggal 2 Lantai Modern',
    JSON.stringify(entry?.ctx));
  check('C.5 prompt tetap prefill (bukan autosend) + kategori form jadi chip pertama',
    peekPendingAiEntry()?.ctx.initialPrompt === prompt &&
    peekPendingAiEntry()?.ctx.sendMode !== 'autosend' &&
    suggestions[0] === 'Rumah Tinggal' && suggestions.length === 6);
}

/* ------------------------------------------------------------------ */
/* D — Follow-up per kategori tepat 1x + alur penuh sampai draft       */
/*     (sapaan -> chip -> follow-up -> jawaban -> ringkasan/brief ->    */
/*     draft; titik awal tiap alur adalah tryGreetingRabType — fungsi   */
/*     yang dipanggil submit() saat awaitingRabType aktif sesudah       */
/*     sapaan disematkan.)                                              */
/* ------------------------------------------------------------------ */
console.log('== D — Follow-up per kategori (tepat 1x) + alur sampai draft ==');
{
  // D.1 Rumah Tinggal: lantai -> luas -> finalisasi -> draft tabel.
  reset();
  const formHouse: NewProjectFormInput = { name: 'Rumah Keluarga', buildingType: 'Rumah Tinggal' };
  const gHouse = buildNewProjectGreeting(formHouse);
  const chipsHouse = buildNewProjectGreetingSuggestions(formHouse);
  check('D.1a sapaan rumah memakai nama + chip pertama "Rumah Tinggal"',
    gHouse.includes('Rumah Keluarga') && chipsHouse[0] === 'Rumah Tinggal');
  const h1 = tryGreetingRabType('Rumah Tinggal', null) as Res;
  const floorChips = (h1.actions ?? []).filter((a) => a.action.param?.startsWith('floors:'));
  check('D.1b chip Rumah: ringkasan + "Berapa lantai?" + chip 1/2/3/4+',
    h1.message.includes('ringkasan kebutuhan') && h1.message.includes('Berapa lantai?') &&
    h1.awaitRabNeeds === true &&
    JSON.stringify(floorChips.map((c) => c.label)) === JSON.stringify(['1 lantai', '2 lantai', '3 lantai', '4+ lantai']));
  const h2 = continueRabNeeds('2 lantai', null) as Res;
  check('D.1c jawaban "2 lantai" tersimpan (floors=2)',
    getLastRabNeeds()?.floors === 2 && h2.message.includes('Jumlah lantai: 2 lantai'));
  const h3 = continueRabNeeds('luas bangunan 120 m2', null) as Res;
  check('D.1d jawaban luas diterima; alur meminta finalisasi ("itu aja")',
    h3.message.includes('Luas bangunan: 120 m²') && h3.message.includes('itu aja'));
  const h4 = continueRabFinalize('itu aja', null) as Res | null;
  check('D.1e finalisasi -> tabel draft rumah (2 lantai, 120 m2) + aksi Push',
    h4 != null && h4.message.includes('Draft RAB rumah tinggal — 2 lantai · luas bangunan 120 m².') &&
    hasAction(h4, 'push-rab'));
  const houseAll = [h1.message, h2.message, h3.message, h4?.message ?? ''].join('\n');
  check('D.1f "Berapa lantai?" muncul TEPAT 1x sepanjang alur rumah',
    count(houseAll, /Berapa lantai\?/g) === 1, count(houseAll, /Berapa lantai\?/g));
  check('D.1g ringkasan mendahului draft (bukan draft tanpa ringkasan)',
    houseAll.indexOf('ringkasan kebutuhan') < houseAll.indexOf('Draft RAB rumah tinggal'));

  // Rumah 3 lantai: di luar model parametrik (1-2 lantai) — penolakan
  // jujur, BUKAN draft karangan.
  reset();
  tryGreetingRabType('Rumah Tinggal', null);
  continueRabNeeds('3 lantai', null);
  continueRabNeeds('luas bangunan 120 m2', null);
  const h5 = continueRabFinalize('itu aja', null) as Res | null;
  check('D.1h rumah 3 lantai: penolakan jujur (model 1-2 lantai), tanpa tabel draft',
    h5 != null && h5.message.includes('mendukung 1–2 lantai') && !h5.message.includes('Draft RAB rumah tinggal'));

  // D.2 Landscape & Taman: konsep -> fasilitas -> kondisi lahan -> pratinjau -> draft.
  reset();
  const l1 = tryGreetingRabType('Landscape & Taman', null) as Res;
  check('D.2a chip Landscape: pertanyaan konsep tampil',
    l1.message.includes('Landscape seperti apa'));
  const l2 = executeIntent('RAB_CONCEPT_SELECT', 'custom', ctxFor('')) as Res;
  check('D.2b konsep custom -> pertanyaan fasilitas',
    l2.message.includes('Fasilitas apa saja yang dibutuhkan'));
  const l3 = tryContinueProjectContext('jogging track dan area duduk', null) as Res | null;
  check('D.2c jawaban fasilitas -> pertanyaan kondisi lahan',
    (l3?.message ?? '').includes('Bagaimana kondisi lahan eksistingnya?'));
  const l4 = tryContinueProjectContext('lahan miring', null) as Res | null;
  check('D.2d jawaban "lahan miring" -> pratinjau (ringkasan) sebelum draft',
    (l4?.message ?? '').includes('Pratinjau RAB — sebelum disusun final') &&
    (l4?.message ?? '').includes('lahan berkontur/miring'));
  const l5 = tryContinueProjectContext('luas 895 m2', null) as Res | null;
  check('D.2e jawaban luas 895 m2 tercatat di pratinjau yang diperbarui',
    (l5?.message ?? '').includes('Total luas: 895 m²') &&
    (l5?.message ?? '').includes('Pratinjau RAB — sebelum disusun final'));
  const l6 = executeIntent('RAB_PROJECT_PREVIEW', 'generate', ctxFor('')) as Res;
  check('D.2f generate sesudah pratinjau -> draft landscape (895 m2)',
    l6.ok === true && l6.message.includes('ini draft RAB **Lanskap, Pagar & Halaman**') &&
    l6.message.includes('luas 895 m²'));
  const landAll = [l1.message, l2.message, l3?.message ?? '', l4?.message ?? '', l5?.message ?? '', l6.message].join('\n');
  check('D.2g "Landscape seperti apa" muncul TEPAT 1x sepanjang alur landscape',
    count(landAll, /Landscape seperti apa/g) === 1, count(landAll, /Landscape seperti apa/g));

  // D.3 Gudang: luas -> sistem + clear height -> kuesioner -> brief -> draft.
  reset();
  const g1 = tryGreetingRabType('Gudang', null) as Res;
  check('D.3a chip Gudang: pertanyaan luas bangunan total',
    g1.message.includes('luas bangunan total'));
  const g2 = tryContinueUniversalContext('luas bangunan 500 m2', null) as Res | null;
  check('D.3b jawaban luas -> sistem struktur + clear height (1 pertanyaan gabungan)',
    (g2?.message ?? '').includes('clear height') &&
    (g2?.message ?? '').includes('portal frame'));
  const g3 = tryContinueUniversalContext('portal frame, clear height 8 m', null) as Res | null;
  check('D.3c jawaban tersimpan (sistem portal frame, heightM 8) lalu kuesioner',
    getUniversalContextState()?.answers['warehouse-system'] === 'portal frame' &&
    getUniversalContextState()?.heightM === 8 &&
    (g3?.message ?? '').includes('kuesioner'));
  const g4 = tryContinueUniversalContext('itu aja', null) as Res | null;
  check('D.3d "itu aja" -> brief proyek sebelum draft',
    (g4?.message ?? '').includes('Brief proyek — periksa dulu sebelum RAB disusun:'));
  const g5 = executeIntent('RAB_INTAKE_GENERATE', undefined, ctxFor('')) as Res;
  check('D.3e generate sesudah brief -> draft gudang (500 m2)',
    g5.ok === true && g5.message.includes('ini draft RAB **Bangunan (umum)**') &&
    g5.message.includes('luas 500 m²'));
  const gudangAll = [g1.message, g2?.message ?? '', g3?.message ?? '', g4?.message ?? '', g5.message].join('\n');
  check('D.3f "luas bangunan total" TEPAT 1x + "clear height" TEPAT 1x sepanjang alur gudang',
    count(gudangAll, /luas bangunan total/g) === 1 && count(gudangAll, /clear height/g) === 1,
    `luas=${count(gudangAll, /luas bangunan total/g)} clearHeight=${count(gudangAll, /clear height/g)}`);

  // D.4 Drainase: panjang -> tipe -> kuesioner -> brief -> draft.
  reset();
  const d1 = tryGreetingRabType('Drainase', null) as Res;
  check('D.4a chip Drainase: pertanyaan panjang',
    d1.message.includes('panjang (meter)'));
  const d2 = tryContinueUniversalContext('panjang 500 meter', null) as Res | null;
  check('D.4b jawaban panjang -> pertanyaan tipe saluran (U-ditch pracetak)',
    (d2?.message ?? '').includes('U-ditch pracetak') &&
    (d2?.message ?? '').includes('Panjang: 500 m'));
  const d3 = tryContinueUniversalContext('U-ditch pracetak', null) as Res | null;
  check('D.4c jawaban tipe -> kuesioner',
    (d3?.message ?? '').includes('kuesioner') &&
    (d3?.message ?? '').includes('Tipe drainase: U-Ditch Pracetak'));
  const d4 = tryContinueUniversalContext('itu aja', null) as Res | null;
  check('D.4d "itu aja" -> brief proyek sebelum draft',
    (d4?.message ?? '').includes('Brief proyek — periksa dulu sebelum RAB disusun:') &&
    (d4?.message ?? '').includes('Panjang pekerjaan: 500 m'));
  const d5 = executeIntent('RAB_INTAKE_GENERATE', undefined, ctxFor('')) as Res;
  check('D.4e generate sesudah brief -> draft drainase (500 m)',
    d5.ok === true && d5.message.includes('ini draft RAB **Drainase & Saluran**') &&
    d5.message.includes('panjang 500 m'));
  const drainAll = [d1.message, d2?.message ?? '', d3?.message ?? '', d4?.message ?? '', d5.message].join('\n');
  check('D.4f "panjang (meter)" TEPAT 1x sepanjang alur drainase',
    count(drainAll, /panjang \(meter\)/g) === 1, count(drainAll, /panjang \(meter\)/g));

  // D.5 Jembatan: bentang -> tipe -> kuesioner -> brief -> draft.
  reset();
  const j1 = tryGreetingRabType('Jembatan', null) as Res;
  check('D.5a chip Jembatan: pertanyaan bentang (bukan panjang total)',
    j1.message.includes('bentang jembatan') && j1.message.includes('bukan panjang totalnya'));
  const j2 = tryContinueUniversalContext('bentang 20 meter', null) as Res | null;
  check('D.5b jawaban bentang -> pertanyaan tipe konstruksi (beton/baja/kayu)',
    (j2?.message ?? '').includes('Bentang: 20 m') &&
    /beton.*baja.*kayu/s.test(j2?.message ?? ''));
  const j3 = tryContinueUniversalContext('beton', null) as Res | null;
  check('D.5c jawaban "beton" -> kuesioner (bukan tanya bentang/tipe ulang)',
    (j3?.message ?? '').includes('kuesioner') &&
    !(j3?.message ?? '').includes('bentang jembatan'));
  const j4 = tryContinueUniversalContext('lahan datar', null) as Res | null;
  check('D.5d jawaban kondisi lahan dicatat (bukan pertanyaan ulang)',
    (j4?.message ?? '').includes('kondisi lahan lahan datar'));
  const j5 = tryContinueUniversalContext('itu aja', null) as Res | null;
  check('D.5e "itu aja" -> brief (kondisi lahan tercatat, bentang 20 m)',
    (j5?.message ?? '').includes('Brief proyek — periksa dulu sebelum RAB disusun:') &&
    (j5?.message ?? '').includes('Kondisi lahan: lahan datar') &&
    (j5?.message ?? '').includes('Bentang: 20 m'));
  const j6 = executeIntent('RAB_INTAKE_GENERATE', undefined, ctxFor('')) as Res;
  check('D.5f generate sesudah brief -> draft jembatan (bentang 20 m)',
    j6.ok === true && j6.message.includes('ini draft RAB **Jembatan & Struktur Khusus**') &&
    j6.message.includes('bentang 20 m'));
  const jembAll = [j1.message, j2?.message ?? '', j3?.message ?? '', j4?.message ?? '', j5?.message ?? '', j6.message].join('\n');
  check('D.5g "bentang jembatan" TEPAT 1x sepanjang alur jembatan',
    count(jembAll, /bentang jembatan/g) === 1, count(jembAll, /bentang jembatan/g));

  // D.6 Renovasi: lingkup -> luas -> kuesioner -> brief -> draft.
  reset();
  const v1 = tryGreetingRabType('Renovasi', null) as Res;
  check('D.6a chip Renovasi: pertanyaan lingkup',
    v1.message.includes('Bagian mana saja yang ingin direnovasi'));
  const v2 = tryContinueUniversalContext('dapur dan kamar mandi', null) as Res | null;
  check('D.6b jawaban lingkup tercatat -> kuesioner',
    (v2?.message ?? '').includes('dapur, kamar mandi') &&
    (v2?.message ?? '').includes('kuesioner'));
  const v3 = tryContinueUniversalContext('luas 100 m2', null) as Res | null;
  check('D.6c jawaban luas 100 m2 tercatat',
    (v3?.message ?? '').includes('Luas bangunan: 100 m²'));
  const v4 = tryContinueUniversalContext('itu aja', null) as Res | null;
  check('D.6d "itu aja" -> brief proyek sebelum draft',
    (v4?.message ?? '').includes('Brief proyek — periksa dulu sebelum RAB disusun:') &&
    (v4?.message ?? '').includes('dapur, kamar mandi'));
  const v5 = executeIntent('RAB_INTAKE_GENERATE', undefined, ctxFor('')) as Res;
  check('D.6e generate sesudah brief -> draft renovasi (100 m2)',
    v5.ok === true && v5.message.includes('ini draft RAB **Renovasi & Rehabilitasi**') &&
    v5.message.includes('luas 100 m²'));
  const renovAll = [v1.message, v2?.message ?? '', v3?.message ?? '', v4?.message ?? '', v5.message].join('\n');
  check('D.6f "Bagian mana saja yang ingin direnovasi" TEPAT 1x sepanjang alur renovasi',
    count(renovAll, /Bagian mana saja yang ingin direnovasi/g) === 1,
    count(renovAll, /Bagian mana saja yang ingin direnovasi/g));
}

/* ------------------------------------------------------------------ */
/* E — Kondisi lahan/tapak tepat 1x                                    */
/* ------------------------------------------------------------------ */
console.log('== E — Kondisi lahan/tapak tepat 1x ==');
{
  // E.1 Landscape (alur chip): pertanyaan kondisi lahan eksisting 1x.
  reset();
  tryGreetingRabType('Landscape & Taman', null);
  executeIntent('RAB_CONCEPT_SELECT', 'custom', ctxFor(''));
  const eL2 = tryContinueProjectContext('jogging track dan area duduk', null) as Res | null;
  const eL3 = tryContinueProjectContext('lahan miring', null) as Res | null;
  const landSiteAll = [(eL2?.message ?? ''), (eL3?.message ?? '')].join('\n');
  check('E.1 landscape: "Bagaimana kondisi lahan eksistingnya?" TEPAT 1x; jawaban tercatat; tidak ditanya ulang sesudah dijawab',
    count(landSiteAll, /Bagaimana kondisi lahan eksistingnya\?/g) === 1 &&
    (eL3?.message ?? '').includes('lahan berkontur/miring') &&
    !(eL3?.message ?? '').includes('Bagaimana kondisi lahan eksistingnya?'),
    count(landSiteAll, /Bagaimana kondisi lahan eksistingnya\?/g));

  // E.2 Non-landscape (jembatan, alur chip penuh sampai draft): pertanyaan
  // generik "kondisi lahan/tapaknya" HARUSNYA ditanya tepat 1x — CEK INI
  // GAGAL (teramati 0x). JANGAN dilonggarkan: akar penyebab —
  //  (1) universalIntake.ts:1622 (selectNextQuestion §7): pertanyaan
  //      NON-KRITIS hanya diajukan sebagai pertanyaan PERTAMA intake;
  //      begitu satu pertanyaan kritis sudah diajukan (bentang di alur
  //      chip), site-condition dilewati — hanya warehouse-system yang
  //      dikecualikan;
  //  (2) actionRegistry.ts:1822-1833 GATE 1 (5A) + :1809-1814 (jembatan):
  //      spek lengkap langsung ke jalur cepat draft tanpa pertanyaan.
  //  Akibatnya kondisi lahan hanya mendarat sebagai baris "belum
  //  teresolusi" di brief (lihat E.3), bukan sebagai pertanyaan.
  //  (Satu-satunya jalur yang MASIH menanyakannya 1x adalah gerbang
  //  clarify universalIntakeGate(..., true, ...) — sudah dipin di
  //  magicAiStep3.test.ts §site, bukan alur chip proyek baru.)
  reset();
  const eJ1 = tryGreetingRabType('Jembatan', null) as Res;
  const eJ2 = tryContinueUniversalContext('bentang 20 meter', null) as Res | null;
  const eJ3 = tryContinueUniversalContext('beton', null) as Res | null;
  const eJ4 = tryContinueUniversalContext('itu aja', null) as Res | null;
  const eJ5 = executeIntent('RAB_INTAKE_GENERATE', undefined, ctxFor('')) as Res;
  const jembSiteAll = [eJ1.message, eJ2?.message ?? '', eJ3?.message ?? '', eJ4?.message ?? '', eJ5.message].join('\n');
  check('E.2 [GAGAL-DIDOKUMENTASIKAN] jembatan (alur chip): pertanyaan generik "kondisi lahan/tapaknya" TEPAT 1x',
    count(jembSiteAll, /kondisi lahan\/tapaknya/g) === 1,
    `teramati ${count(jembSiteAll, /kondisi lahan\/tapaknya/g)}x — akar: universalIntake.ts:1622 (§7) + actionRegistry.ts:1822 (GATE 1)`);

  // E.3 Perilaku yang TERAMATI (bukan yang dispesifikasi): di alur chip
  // gudang, kondisi lahan tercatat tepat 1x sebagai butir belum
  // teresolusi di brief — tidak pernah ditanya, tidak pernah hilang.
  reset();
  tryGreetingRabType('Gudang', null);
  tryContinueUniversalContext('luas bangunan 500 m2', null);
  tryContinueUniversalContext('portal frame, clear height 8 m', null);
  const eG4 = tryContinueUniversalContext('itu aja', null) as Res | null;
  const gudangBrief = eG4?.message ?? '';
  check('E.3 [PERILAKU TERAMATI] gudang: brief memuat "kondisi lahan/tapak eksisting" TEPAT 1x sebagai belum teresolusi',
    count(gudangBrief, /kondisi lahan\/tapak eksisting/g) === 1,
    count(gudangBrief, /kondisi lahan\/tapak eksisting/g));
}

/* ------------------------------------------------------------------ */
/* F — Ringkasan/brief SELALU mendahului tabel draft                   */
/* ------------------------------------------------------------------ */
console.log('== F — Ringkasan/brief sebelum draft ==');
{
  // F.1 Rumah: ringkasan dulu; tanpa sesi kebutuhan, finalisasi -> null.
  reset();
  check('F.1a finalisasi tanpa ringkasan aktif -> null (tidak ada draft)',
    continueRabFinalize('itu aja', null) === null);
  reset();
  const fH1 = tryGreetingRabType('Rumah Tinggal', null) as Res;
  continueRabNeeds('2 lantai', null);
  continueRabNeeds('luas bangunan 120 m2', null);
  const fH4 = continueRabFinalize('itu aja', null) as Res | null;
  const fHouseAll = [fH1.message, fH4?.message ?? ''].join('\n');
  check('F.1b rumah: "ringkasan kebutuhan" mendahului "Draft RAB rumah tinggal"',
    fHouseAll.indexOf('ringkasan kebutuhan') >= 0 &&
    fHouseAll.indexOf('ringkasan kebutuhan') < fHouseAll.indexOf('Draft RAB rumah tinggal'));

  // F.2 Universal: generate tanpa brief aktif -> ditolak, tanpa draft.
  reset();
  const fG0 = executeIntent('RAB_INTAKE_GENERATE', undefined, ctxFor('')) as Res;
  check('F.2a generate tanpa brief aktif -> ok:false + "Brief proyek sudah tidak aktif"',
    fG0.ok === false && fG0.message.includes('Brief proyek sudah tidak aktif'));
  reset();
  tryGreetingRabType('Drainase', null);
  tryContinueUniversalContext('panjang 500 meter', null);
  tryContinueUniversalContext('U-ditch pracetak', null);
  const fD4 = tryContinueUniversalContext('itu aja', null) as Res | null;
  const fD5 = executeIntent('RAB_INTAKE_GENERATE', undefined, ctxFor('')) as Res;
  const fDrainAll = [(fD4?.message ?? ''), fD5.message].join('\n');
  check('F.2b drainase: "Brief proyek — periksa dulu" mendahului "ini draft RAB"',
    fDrainAll.indexOf('Brief proyek — periksa dulu sebelum RAB disusun:') >= 0 &&
    fDrainAll.indexOf('Brief proyek — periksa dulu sebelum RAB disusun:') < fDrainAll.indexOf('ini draft RAB'));

  // F.3 Gudang + jembatan + renovasi: urutan brief -> draft.
  reset();
  tryGreetingRabType('Gudang', null);
  tryContinueUniversalContext('luas bangunan 500 m2', null);
  tryContinueUniversalContext('portal frame, clear height 8 m', null);
  const fG4 = tryContinueUniversalContext('itu aja', null) as Res | null;
  const fG5 = executeIntent('RAB_INTAKE_GENERATE', undefined, ctxFor('')) as Res;
  const fGudangAll = [(fG4?.message ?? ''), fG5.message].join('\n');
  check('F.3a gudang: brief mendahului draft',
    fGudangAll.indexOf('Brief proyek — periksa dulu sebelum RAB disusun:') >= 0 &&
    fGudangAll.indexOf('Brief proyek — periksa dulu sebelum RAB disusun:') < fGudangAll.indexOf('ini draft RAB'));
  reset();
  tryGreetingRabType('Jembatan', null);
  tryContinueUniversalContext('bentang 20 meter', null);
  tryContinueUniversalContext('beton', null);
  tryContinueUniversalContext('lahan datar', null);
  const fJ5 = tryContinueUniversalContext('itu aja', null) as Res | null;
  const fJ6 = executeIntent('RAB_INTAKE_GENERATE', undefined, ctxFor('')) as Res;
  const fJembAll = [(fJ5?.message ?? ''), fJ6.message].join('\n');
  check('F.3b jembatan: brief mendahului draft',
    fJembAll.indexOf('Brief proyek — periksa dulu sebelum RAB disusun:') >= 0 &&
    fJembAll.indexOf('Brief proyek — periksa dulu sebelum RAB disusun:') < fJembAll.indexOf('ini draft RAB'));
  reset();
  tryGreetingRabType('Renovasi', null);
  tryContinueUniversalContext('dapur dan kamar mandi', null);
  tryContinueUniversalContext('luas 100 m2', null);
  const fV4 = tryContinueUniversalContext('itu aja', null) as Res | null;
  const fV5 = executeIntent('RAB_INTAKE_GENERATE', undefined, ctxFor('')) as Res;
  const fRenovAll = [(fV4?.message ?? ''), fV5.message].join('\n');
  check('F.3c renovasi: brief mendahului draft',
    fRenovAll.indexOf('Brief proyek — periksa dulu sebelum RAB disusun:') >= 0 &&
    fRenovAll.indexOf('Brief proyek — periksa dulu sebelum RAB disusun:') < fRenovAll.indexOf('ini draft RAB'));

  // F.4 Landscape: pratinjau dulu; generate SEBELUM luas terisi menolak
  // jujur (tanpa draft karangan), sesudah luas -> draft.
  reset();
  tryGreetingRabType('Landscape & Taman', null);
  executeIntent('RAB_CONCEPT_SELECT', 'custom', ctxFor(''));
  tryContinueProjectContext('jogging track dan area duduk', null);
  const fL4 = tryContinueProjectContext('lahan miring', null) as Res | null;
  const fL0 = executeIntent('RAB_PROJECT_PREVIEW', 'generate', ctxFor('')) as Res;
  check('F.4a landscape: generate sebelum luas -> penolakan jujur, TANPA tabel draft',
    (fL0.message ?? '').includes('belum bisa menghitung volume') &&
    !(fL0.message ?? '').includes('ini draft RAB'));
  const fL5 = tryContinueProjectContext('luas 895 m2', null) as Res | null;
  const fL6 = executeIntent('RAB_PROJECT_PREVIEW', 'generate', ctxFor('')) as Res;
  const fLandAll = [(fL4?.message ?? ''), (fL5?.message ?? ''), fL6.message].join('\n');
  check('F.4b landscape: "Pratinjau RAB — sebelum disusun final" mendahului "ini draft RAB"',
    fLandAll.indexOf('Pratinjau RAB — sebelum disusun final') >= 0 &&
    fLandAll.indexOf('Pratinjau RAB — sebelum disusun final') < fLandAll.indexOf('ini draft RAB'));
}

/* ------------------------------------------------------------------ */
/* G — D5 ask-back lewat alur baru (prompt sintesis form)              */
/* ------------------------------------------------------------------ */
console.log('== G — D5 ask-back lewat alur baru ==');
{
  reset();
  const d5Form: NewProjectFormInput = {
    name: 'Gudang Baru Sidoarjo',
    buildingType: 'Gudang & Pabrik',
    buildingAreaM2: 600,
    floorCount: 1,
    maxBudgetRp: 150000000,
  };
  const d5Prompt = buildNewProjectMagicPrompt(d5Form);
  check('G.0 prompt sintesis memuat budget sebagai maksimal (bahan bakar D5)',
    d5Prompt.includes('Anggaran maksimal Rp150.000.000.'));
  const live = executeIntent('CREATE_RAB_SUMMARY', undefined, ctxFor(d5Prompt)) as Res;
  check('G.1 draft OVER -> tanya-balik aktif (awaitBudgetDecision)',
    live.ok === true && live.awaitBudgetDecision === true);
  check('G.2 pesan tanya-balik: MELEBIHI Rp657.150.000 + "perlu keputusan Anda" + 3 opsi',
    live.message.includes('MELEBIHI anggaran sebesar Rp657.150.000') &&
    live.message.includes('perlu keputusan Anda') &&
    live.message.includes('Kurangi lingkup') &&
    live.message.includes('Tambah budget') &&
    live.message.includes('Ganti spek/material'));
  check('G.3 TANPA Push (aksi maupun kalimat) + draft dinyatakan BELUM final / BELUM bisa ditransfer',
    !hasAction(live, 'push-universal') &&
    !live.message.includes('Push ke Spreadsheet') &&
    live.message.includes('BELUM final') &&
    live.message.includes('BELUM bisa ditransfer') &&
    (live.actions ?? []).length === 3 &&
    hasAction(live, 'budget-decision-reduce-scope') &&
    hasAction(live, 'budget-decision-raise-budget') &&
    hasAction(live, 'budget-decision-change-spec'));
  const d = getLastUniversalDraft();
  const dec = d ? overBudgetDecision(d) : null;
  check('G.4 angka D5: total Rp807.150.000 vs cap Rp150.000.000 (lebih Rp657.150.000)',
    d != null && dec != null && dec.total === 807150000 && dec.cap === 150000000 && dec.over === 657150000,
    dec ? `total=${dec.total} cap=${dec.cap} over=${dec.over}` : 'no draft/decision');
  check('G.5 draft belum bisa ditransfer: validateTransfer menolak (alasan budget)',
    d != null && validateTransfer(d, 'proj-1').allowed === false &&
    validateTransfer(d, 'proj-1').reasons.some((r) => r.includes('pertanyaan budget')));
  check('G.6 draft belum bisa ditransfer: buildPushPayload melempar (budget)',
    d != null && (() => { try { buildPushPayload(d); return false; } catch (e) { return (e as Error).message.includes('pertanyaan budget'); } })());
  check('G.7 slot pertanyaan budget terisi (draft sama)',
    __getPendingBudgetDecisionForTests() != null &&
    __getPendingBudgetDecisionForTests()?.draftId === d?.id);
  const ansB = continueBudgetDecision('tambah budget jadi 1000 juta');
  check('G.8 jawaban (b) "tambah budget jadi 1000 juta" -> UNDER + Push kembali + slot bersih',
    ansB != null && ansB.ok === true && ansB.message.includes('DI BAWAH anggaran') &&
    hasAction(ansB, 'push-universal') &&
    __getPendingBudgetDecisionForTests() === null &&
    getLastUniversalDraft()?.budgetDecisionPending === false);
}

console.log(`\nnewProjectFlow: ${passed} lolos, ${failed} gagal${failed ? ` — GAGAL: ${failures.join(' | ')}` : ''}`);
if (failed > 0) process.exit(1);
console.log('SEMUA TEST newProjectFlow LOLOS');

/**
 * EZRAB AI WORKFLOW HARDENING — WORKER B (2026-11-26).
 * E-GAP-E1: keadaan `saveStatus: 'dirty'` adalah DEAD STATE — indikator
 * "Belum tersimpan" tidak pernah bisa muncul karena efek debounce langsung
 * men-set 'saving' pada setiap perubahan.
 *
 * Perbaikan (src/context/ProjectContext.tsx, efek debounce — SATU
 * pendekatan, efek-based; mutator TIDAK men-set saveStatus):
 *   data berubah → 'dirty' (jendela debounce 400 ms) → 'saving' (saat
 *   flush mulai; di-commit sinkron via flushSync di flushToStorage) →
 *   'saved' / 'error' (sesudah flush). Mount bukan dirty; ganti proyek
 *   saja (tanpa perubahan data) bukan dirty; update no-op (hanya stempel
 *   updatedAt) bukan dirty; ganti proyek saat ada perubahan tertunda
 *   TIDAK mereset 'dirty' (status milik SELURUH store lokal, bukan
 *   per-proyek — tidak ada "save state proyek lain" yang bocor).
 *
 * Kasus direktif: (1) edit → dirty; (2) tunggu debounce → saving;
 * (3) tulis sukses → saved; (4) tulis gagal → error; (5) edit sesudah
 * saved → dirty lagi; (6) update no-op → tanpa dirty palsu; (7) ganti
 * proyek tidak menampilkan save state proyek lain; (8) karantina
 * storage korup tetap jalan (cek ringan di sini + suite regresi
 * p1BackupRestore / aiWorkflowSprintPersistence tetap hijau).
 *
 * Render INTERAKTIF via jsdom + react-dom/client, TANPA act() — plain
 * await dengan scheduling mirip produksi, supaya keadaan antara
 * ('dirty', 'saving') sempat ter-commit dan teramati. (act() menahan
 * commit sampai scope selesai dan meruntuhkan keadaan antara.)
 * Import ProjectContext langsung: tidak ada impor CSS di rantai
 * impornya, jadi tsx polos cukup — tanpa loader CSS.
 *
 * Jalankan dari ROOT repo:
 *   npx --yes tsx src/test/aiWorkflowHardeningDirtyState.test.ts
 * (skrip asersi tsx polos — BUKAN vitest.)
 */
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; failures.push(name); console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

type Ctx = {
  saveStatus: string;
  saveError: string | null;
  projects: Array<{ id: string; name: string; updatedAt?: string }>;
  currentProjectId: string | null;
  createProject: (d: Record<string, unknown>) => { id: string };
  updateProject: (id: string, d: Record<string, unknown>) => void;
  setCurrentProjectId: (id: string | null) => void;
};

const SEED_ID = 'PRJ-DIRTY-A';
const SEED_NAME = 'Proyek Dirty A';

function zeroCostSummary(): Record<string, unknown> {
  return {
    directCost: 0, overheadPercent: 0, overheadAmount: 0, profitPercent: 0,
    profitAmount: 0, contingencyPercent: 0, contingencyAmount: 0,
    directorMarkupPercent: 0, directorMarkupNominal: 0, directorMarkupTotal: 0,
    showMarkupToEditor: false, showMarkupToClient: false, subtotalBeforeTax: 0,
    taxPercent: 11, taxAmount: 0, grandTotal: 0, costPerM2: 0,
  };
}

function seedProject(id: string, name: string): Record<string, unknown> {
  return {
    id, projectNumber: `PRJ-2026-${id.slice(-4)}`, name, client: 'Klien Uji',
    clientName: 'Klien Uji', location: 'Indonesia', buildingType: 'Rumah Tinggal',
    status: 'draft', progress: 0, totalRab: 0,
    createdAt: '2026-11-26T00:00:00.000Z', updatedAt: '2026-11-26T00:00:00.000Z',
    itemsCount: 0, sections: [], costSummary: zeroCostSummary(),
  };
}

/** Isi envelope versioned hasil flush: { v, savedAt, writeId, data }. */
function readStoredProjects(store: Record<string, string>): Array<{ id: string; name: string; updatedAt?: string }> | null {
  const raw = store['ezrab_prod_projects'];
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { data?: unknown };
    if (parsed && Array.isArray(parsed.data)) return parsed.data as Array<{ id: string; name: string; updatedAt?: string }>;
    return null;
  } catch { return null; }
}

async function main(): Promise<void> {
  /* ---------------- jsdom + localStorage shim ---------------- */
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/' });
  const g = globalThis as unknown as Record<string, unknown>;
  g.window = dom.window;
  g.document = dom.window.document;
  Object.defineProperty(g, 'navigator', { value: dom.window.navigator, configurable: true });
  g.HTMLElement = dom.window.HTMLElement;
  g.Node = dom.window.Node;

  const store: Record<string, string> = {};
  let failWrites = false;
  g.localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      if (failWrites) throw new Error('QuotaExceededError: localStorage quota exceeded (simulasi tes)');
      store[k] = String(v);
    },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
    key: (i: number) => Object.keys(store)[i] ?? null,
    get length() { return Object.keys(store).length; },
  };

  const React = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { ProjectProvider, useProject } = await import('../context/ProjectContext');

  /* ---------------- probe: rekam setiap commit saveStatus ---------------- */
  const t0 = Date.now();
  const seen: Array<{ status: string; t: number }> = [];
  let ctx: Ctx | null = null;
  function Probe() {
    const c = useProject() as unknown as Ctx;
    ctx = c;
    React.useEffect(() => { seen.push({ status: c.saveStatus, t: Date.now() - t0 }); }, [c.saveStatus]);
    return React.createElement('div', null, 'probe');
  }
  const mark = () => seen.length;
  const seqSince = (m: number) => seen.slice(m).map((s) => s.status);
  const hasOrderedSubseq = (m: number, want: string[]) => {
    const seq = seqSince(m);
    let j = 0;
    for (const s of seq) { if (s === want[j]) { j++; if (j === want.length) return true; } }
    return false;
  };
  async function waitForStatus(want: string, timeoutMs = 3000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (ctx && ctx.saveStatus === want) return true;
      await sleep(25);
    }
    return !!ctx && ctx.saveStatus === want;
  }
  const cur = () => {
    if (!ctx) throw new Error('probe belum commit');
    return ctx;
  };

  /* ---------------- seed: instalasi lama yang tenang ---------------- */
  // Satu proyek tanpa item (reconcile mount tidak mengubah apa pun),
  // flag seed + premium-demo sudah diset (tanpa injeksi/refresh saat mount).
  store['ezrab_prod_seeded_v1'] = '1';
  store['ezrab_premium_demo_v1'] = '1';
  store['ezrab_premium_demo_dataset_v'] = '2';
  store['ezrab_prod_projects'] = JSON.stringify([seedProject(SEED_ID, SEED_NAME)]);
  store['ezrab_prod_active_project_id'] = SEED_ID;

  const doc = document as unknown as Document;
  const el = doc.createElement('div');
  doc.body.appendChild(el);
  const root = createRoot(el);
  root.render(React.createElement(ProjectProvider, null, React.createElement(Probe)));
  await sleep(150);

  /* ---------------- 0 — mount: bukan dirty, flush mount jalan ---------------- */
  console.log('== 0 — Mount (bukan dirty palsu) ==');
  check('0.1 mount: status awal ter-commit', !!ctx && ['saved', 'saving'].includes(ctx.saveStatus),
    `dapat ${ctx?.saveStatus}`);
  check('0.2 mount: TIDAK ada dirty (state awal baru dimuat dari storage)',
    !seen.some((s) => s.status === 'dirty'), `urutan: ${JSON.stringify(seqSince(0))}`);
  check('0.3 mount: flush mount mencapai saved', await waitForStatus('saved'),
    `status ${cur().saveStatus}, urutan: ${JSON.stringify(seqSince(0))}`);
  const storedAfterMount = readStoredProjects(store);
  check('0.4 mount: proyek seed tertulis ke storage (envelope versioned)',
    !!storedAfterMount && storedAfterMount.some((p) => p.id === SEED_ID && p.name === SEED_NAME),
    `dapat ${JSON.stringify(storedAfterMount?.map((p) => p.id))}`);

  /* ---------------- 1/2/3 — edit → dirty → saving → saved ---------------- */
  console.log('== 1–3 — Edit → dirty → saving → saved (E2E) ==');
  const m1 = mark();
  cur().updateProject(SEED_ID, { name: 'Proyek Dirty A — Revisi 1' });
  await sleep(120);
  check('1.1 edit: status dirty dalam 120 ms (sebelum flush 400 ms)',
    cur().saveStatus === 'dirty', `dapat ${cur().saveStatus}`);
  const storedWhileDirty = readStoredProjects(store);
  check('1.2 edit: storage BELUM berisi revisi saat dirty (belum ada klaim sukses sebelum tulis)',
    !!storedWhileDirty && storedWhileDirty.some((p) => p.id === SEED_ID && p.name === SEED_NAME),
    `dapat ${JSON.stringify(storedWhileDirty?.find((p) => p.id === SEED_ID)?.name)}`);
  check('2.1 tunggu debounce: urutan dirty → saving → saved teramati',
    (await waitForStatus('saved')) && hasOrderedSubseq(m1, ['dirty', 'saving', 'saved']),
    `urutan sejak edit: ${JSON.stringify(seqSince(m1))}`);
  const storedAfterSave = readStoredProjects(store);
  check('3.1 tulis sukses: revisi tertulis HANYA sesudah saved',
    !!storedAfterSave && storedAfterSave.some((p) => p.id === SEED_ID && p.name === 'Proyek Dirty A — Revisi 1'),
    `dapat ${JSON.stringify(storedAfterSave?.find((p) => p.id === SEED_ID)?.name)}`);

  /* ---------------- 5 — edit sesudah saved → dirty lagi ---------------- */
  console.log('== 5 — Edit sesudah saved → dirty lagi ==');
  const m5 = mark();
  cur().updateProject(SEED_ID, { name: 'Proyek Dirty A — Revisi 2' });
  await sleep(120);
  check('5.1 edit sesudah saved → dirty lagi', cur().saveStatus === 'dirty', `dapat ${cur().saveStatus}`);
  check('5.2 siklus kedua: dirty → saving → saved',
    (await waitForStatus('saved')) && hasOrderedSubseq(m5, ['dirty', 'saving', 'saved']),
    `urutan: ${JSON.stringify(seqSince(m5))}`);

  /* ---------------- 6 — update no-op → tanpa dirty palsu ---------------- */
  console.log('== 6 — Update no-op → tanpa dirty palsu ==');
  const m6a = mark();
  cur().setCurrentProjectId(SEED_ID); // proyek aktif yang sama
  await sleep(650);
  check('6.1 setCurrentProjectId(id yang sama) → status tetap saved, tanpa transisi',
    cur().saveStatus === 'saved' && seqSince(m6a).length === 0,
    `status ${cur().saveStatus}, transisi: ${JSON.stringify(seqSince(m6a))}`);
  const rawBeforeNoop = store['ezrab_prod_projects'];
  const m6b = mark();
  cur().updateProject(SEED_ID, { name: 'Proyek Dirty A — Revisi 2' }); // nilai IDENTIK
  await sleep(650);
  check('6.2 updateProject nilai identik → tanpa dirty (hanya stempel updatedAt)',
    cur().saveStatus === 'saved' && !seqSince(m6b).includes('dirty'),
    `status ${cur().saveStatus}, transisi: ${JSON.stringify(seqSince(m6b))}`);
  check('6.3 update no-op → storage TIDAK ditulis ulang (byte identik)',
    store['ezrab_prod_projects'] === rawBeforeNoop,
    'byte storage berubah padahal tidak ada data baru');

  /* ---------------- 7 — ganti proyek ≠ save state proyek lain ---------------- */
  console.log('== 7 — Ganti proyek (isolasi status simpan) ==');
  const m7a = mark();
  const projB = cur().createProject({ name: 'Proyek Dirty B' });
  check('7.1 buat proyek B → dirty (data baru)', (await sleep(120), cur().saveStatus === 'dirty'),
    `dapat ${cur().saveStatus}`);
  check('7.2 proyek B mencapai saved', await waitForStatus('saved'),
    `urutan: ${JSON.stringify(seqSince(m7a))}`);
  check('7.3 proyek aktif kini B', cur().currentProjectId === projB.id, `dapat ${cur().currentProjectId}`);
  const m7b = mark();
  cur().setCurrentProjectId(SEED_ID); // kembali ke A, tanpa edit
  await sleep(650);
  check('7.4 ganti proyek saja (tanpa edit) → TIDAK ada dirty',
    !seqSince(m7b).includes('dirty'), `transisi: ${JSON.stringify(seqSince(m7b))}`);
  check('7.5 ganti proyek saja → berakhir saved', cur().saveStatus === 'saved',
    `dapat ${cur().saveStatus}`);
  check('7.6 penunjuk aktif tertulis (A) sesudah ganti proyek',
    store['ezrab_prod_active_project_id'] === SEED_ID, `dapat ${store['ezrab_prod_active_project_id']}`);
  // Ganti proyek SAAT ada perubahan tertunda: dirty harus bertahan (milik
  // store, bukan proyek A), lalu flush menulis edit A walau sudah di B.
  const m7c = mark();
  cur().updateProject(SEED_ID, { name: 'Proyek Dirty A — Revisi 3' });
  await sleep(120);
  check('7.7 edit A → dirty sebelum ganti proyek', cur().saveStatus === 'dirty',
    `dapat ${cur().saveStatus}`);
  cur().setCurrentProjectId(projB.id);
  await sleep(120);
  check('7.8 ganti proyek saat dirty → status TETAP dirty (tidak direset / bukan state B)',
    cur().saveStatus === 'dirty', `dapat ${cur().saveStatus}`);
  check('7.9 flush tertunda tetap jalan: dirty → saving → saved',
    (await waitForStatus('saved')) && hasOrderedSubseq(m7c, ['dirty', 'saving', 'saved']),
    `urutan: ${JSON.stringify(seqSince(m7c))}`);
  const storedAfterSwitch = readStoredProjects(store);
  check('7.10 edit A tertulis walau flush terjadi sesudah pindah ke B',
    !!storedAfterSwitch && storedAfterSwitch.some((p) => p.id === SEED_ID && p.name === 'Proyek Dirty A — Revisi 3'),
    `dapat ${JSON.stringify(storedAfterSwitch?.find((p) => p.id === SEED_ID)?.name)}`);
  check('7.11 penunjuk aktif tetap B sesudah flush', store['ezrab_prod_active_project_id'] === projB.id,
    `dapat ${store['ezrab_prod_active_project_id']}`);
  cur().setCurrentProjectId(SEED_ID);
  await waitForStatus('saved');

  /* ---------------- 4 — tulis gagal → error; edit lagi → pulih ---------------- */
  console.log('== 4 — Tulis gagal → error; edit lagi → dirty → saved ==');
  failWrites = true;
  const m4 = mark();
  cur().updateProject(SEED_ID, { name: 'Proyek Dirty A — Revisi GAGAL' });
  await sleep(120);
  check('4.1 edit saat storage gagal → dirty dulu', cur().saveStatus === 'dirty',
    `dapat ${cur().saveStatus}`);
  check('4.2 flush gagal → error (bukan saved palsu)',
    await waitForStatus('error'), `status ${cur().saveStatus}, urutan: ${JSON.stringify(seqSince(m4))}`);
  check('4.3 error membawa pesan', typeof cur().saveError === 'string' && (cur().saveError as string).length > 0,
    `dapat ${JSON.stringify(cur().saveError)}`);
  const storedAfterFail = readStoredProjects(store);
  check('4.4 tulis gagal → storage tetap berisi Revisi 3 (tidak tertimpa)',
    !!storedAfterFail && storedAfterFail.some((p) => p.id === SEED_ID && p.name === 'Proyek Dirty A — Revisi 3'),
    `dapat ${JSON.stringify(storedAfterFail?.find((p) => p.id === SEED_ID)?.name)}`);
  failWrites = false;
  const m4b = mark();
  cur().updateProject(SEED_ID, { name: 'Proyek Dirty A — Revisi 4' });
  await sleep(120);
  check('4.5 edit sesudah error → dirty lagi', cur().saveStatus === 'dirty', `dapat ${cur().saveStatus}`);
  check('4.6 sesudah storage pulih: dirty → saving → saved',
    (await waitForStatus('saved')) && hasOrderedSubseq(m4b, ['dirty', 'saving', 'saved']),
    `urutan: ${JSON.stringify(seqSince(m4b))}`);

  /* ---------------- unmount saat dirty → flush unmount, tanpa crash ---------------- */
  console.log('== Unmount saat dirty (race timer) ==');
  cur().updateProject(SEED_ID, { name: 'Proyek Dirty A — Revisi 5' });
  await sleep(120);
  check('U.1 sebelum unmount: dirty', cur().saveStatus === 'dirty', `dapat ${cur().saveStatus}`);
  root.unmount(); // cleanup efek membatalkan timer; flush unmount menulis langsung
  await sleep(100);
  const storedAfterUnmount = readStoredProjects(store);
  check('U.2 unmount saat dirty → flush unmount menulis Revisi 5 (tanpa crash)',
    !!storedAfterUnmount && storedAfterUnmount.some((p) => p.id === SEED_ID && p.name === 'Proyek Dirty A — Revisi 5'),
    `dapat ${JSON.stringify(storedAfterUnmount?.find((p) => p.id === SEED_ID)?.name)}`);

  /* ---------------- 8 — karantina storage korup (cek ringan) ---------------- */
  console.log('== 8 — Karantina storage korup ==');
  for (const k of Object.keys(store)) delete store[k];
  store['ezrab_prod_seeded_v1'] = '1';
  store['ezrab_premium_demo_v1'] = '1';
  store['ezrab_premium_demo_dataset_v'] = '2';
  store['ezrab_prod_projects'] = '{ini json rusak bukan array';
  const el2 = doc.createElement('div');
  doc.body.appendChild(el2);
  const root2 = createRoot(el2);
  root2.render(React.createElement(ProjectProvider, null, React.createElement(Probe)));
  await sleep(150);
  const qkeys = Object.keys(store).filter((k) => k.startsWith('ezrab_prod_projects.corrupt-'));
  check('8.1 payload korup dikarantina (kunci .corrupt-* ada)', qkeys.length === 1,
    `kunci: ${JSON.stringify(Object.keys(store).filter((k) => k.includes('corrupt')))}`);
  check('8.2 byte mentah korup terselamatkan di kunci karantina',
    qkeys.length === 1 && store[qkeys[0]] === '{ini json rusak bukan array',
    `dapat ${qkeys.length === 1 ? JSON.stringify(store[qkeys[0]]) : '—'}`);
  check('8.3 provider mount dengan fallback (bukan crash) dan mencapai saved',
    await waitForStatus('saved'), `status ${cur().saveStatus}`);
  check('8.4 fallback proyek kosong (data korup tidak dipakai)',
    cur().projects.length === 0, `dapat ${cur().projects.length} proyek`);
  root2.unmount();
  await sleep(50);

  /* ---------------- kontrak sumber statis ---------------- */
  console.log('== Kontrak sumber (statis) ==');
  const ctxSrc = readFileSync('src/context/ProjectContext.tsx', 'utf8');
  const dirtyCalls = (ctxSrc.match(/setSaveStatus\('dirty'\)/g) || []).length;
  check('S.1 setSaveStatus(\'dirty\') ada TEPAT 1 kali (efek debounce saja)',
    dirtyCalls === 1, `dapat ${dirtyCalls}`);
  check('S.2 debounce 400 ms dipertahankan (literal setTimeout(flushToStorage, 400))',
    ctxSrc.includes('setTimeout(flushToStorage, 400)'));
  check('S.3 tidak ada mutator yang men-set saveStatus (pendekatan efek saja)',
    !/const (createProject|updateProject|deleteProject|bulkAddRabItems|setCurrentProjectId)[\s\S]{0,400}?setSaveStatus/.test(ctxSrc),
    'mutator men-set saveStatus');

  console.log(`\nHasil: ${passed} lolos, ${failed} gagal`);
  if (failed > 0) {
    console.log('GAGAL:', failures.join(' | '));
    process.exit(1);
  } else {
    console.log('SEMUA TEST AI WORKFLOW HARDENING DIRTY STATE LOLOS');
  }
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});

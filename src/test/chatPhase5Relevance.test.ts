/**
 * chatPhase5Relevance.test.ts — GATE 5 (5E): Relevansi & Validasi
 * Konstruksi (Phase 5 Workflow Integration, direktif owner 2026-11-12
 * 11:45 WIB §6 + §10 Gate 5).
 *
 * Gaya plain-tsx: `npx --yes tsx src/test/chatPhase5Relevance.test.ts`
 *
 * Area:
 *  (a) kalibrasi signature ROAD_ITEM_RE (pengecualian "lantai kerja" —
 *      gelombang kalibrasi yang tertunda dari Overhaul Fase 5 / ARS-05);
 *  (b) gerbang relevansi pada buildDirectRab/buildSpecRab;
 *  (c) part atap mandiri pada alur tanpa-spek (cacat warisan Fase 4 —
 *      dulu Green Roof, kini ROOF-CONCRETE-DECK; laporan rantai spek
 *      §3.5.3/§8);
 *  (d) alasan tertelusur per komponen (spek user / DED / template /
 *      asumsi berlabel / UNRESOLVED);
 *  (e) klarifikasi saat ambigu (gerbang material, needs-spec, BLOCKED);
 *  (f) komponen sah dipertahankan lintas kategori;
 *  (g) multi-gedung (jangkar total kanonis Gate 2 + batasan atap);
 *  (h) regresi Wave E (matriks 13 keluarga + panen katalog LIVE).
 *
 * Setiap tes memakai JALUR NYATA (builder draft kanonis + mesin volume
 * parametrik + gerbang relevansi + registri template), bukan mock jalur.
 * Provider nyata: NOT RUN (0 panggilan).
 */
import { readFileSync } from 'node:fs';

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      console.log(`  PASS ${name}`);
    })
    .catch((e: unknown) => {
      failed += 1;
      const msg = e instanceof Error ? e.message : String(e);
      failures.push(name);
      console.log(`  FAIL ${name}: ${msg}`);
    });
}
const assert = (cond: unknown, msg: string) => {
  if (!cond) throw new Error(msg);
};
const eq = (a: unknown, b: unknown, msg: string) => {
  const ja = JSON.stringify(a);
  const jb = JSON.stringify(b);
  if (ja !== jb) throw new Error(`${msg}\n  expected: ${jb}\n  actual:   ${ja}`);
};

/* ---------- localStorage shim (node) — pola Gate 1 ---------- */
function makeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, String(v));
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => map.clear(),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    },
  };
}
type StorageShim = ReturnType<typeof makeStorage>;
const storage: StorageShim = makeStorage();
(globalThis as Record<string, unknown>).localStorage = storage;

const NOW = '2026-11-12T15:30:00.000Z';
const PROJECT_5E = 'PRJ-5E-A';
const KANDANG_A = 'kandang sapi terbuka 17x9 m, 30 ekor, atap Galvalum, lantai beton miring';
const GUDANG_B = 'buatkan RAB gudang 10 x 20 m atap spandek';

async function main(): Promise<void> {
  console.log('chatPhase5Relevance.test (GATE 5 / 5E)');
  const gate = await import('../ai-tools/ezrab-ai/relevanceGate');
  const rab = await import('../ai-tools/ezrab-ai/universalRab');
  const chain = await import('../ai-tools/ezrab-ai/specChain');
  const { buildDirectRab } = await import('../ai-tools/ezrab-ai/directRab');
  const { buildSpecRab } = await import('../ai-tools/ezrab-ai/specRab');
  const { applyRelevanceGateToDirectCalc } = await import(
    '../ai-tools/ezrab-ai/directRabGate'
  );
  const { mapDirectRabPushItems } = await import('../ai-tools/ezrab-ai/directRabPush');
  const { parametricVolumeEngine } = await import(
    '../engine/parametricVolumeEngine/parametricVolumeEngine'
  );
  const { HouseTypeCatalog } = await import('../data/houseTypeCatalog');
  const { RabTemplateService } = await import('../services/rabTemplateService');
  const reg = await import('../ai-tools/ezrab-ai/actionRegistry');
  const { routeIntent } = await import('../ai-tools/ezrab-ai/intentRouter');

  const lvl = (item: string, pid: string, explicit: string[] = []) =>
    gate.classifyItemRelevance(item, pid, explicit).level;

  console.log('== 5E-01..05 — kalibrasi signature (gelombang tertunda ARS-05) ==');
  await check('5E-01 "Rabat Beton Lantai Kerja" sah: lolos untuk semua id proyek gedung', () => {
    for (const pid of ['rumah', 'gedung', 'kandang', 'renovasi', 'lanskap']) {
      assert(
        lvl('Rabat Beton Lantai Kerja Tebal 5 cm', pid) !== 'REJECTED' &&
          lvl('Rabat Beton Lantai Kerja Tebal 5 cm', pid) !== 'LOW',
        `lantai kerja harus lolos untuk ${pid}, dapat ${lvl('Rabat Beton Lantai Kerja Tebal 5 cm', pid)}`,
      );
    }
  });
  await check('5E-02 kontaminan jalan asli tetap tertolak (rabat beton TANPA "lantai kerja")', () => {
    const road = 'Jalan Inspeksi Rabat Beton Sempit Sepanjang Tanggul';
    for (const pid of ['rumah', 'gedung', 'kandang', 'renovasi', 'lanskap']) {
      eq(lvl(road, pid), 'REJECTED', `jalan inspeksi rabat beton harus REJECTED untuk ${pid}`);
    }
    eq(lvl(road, 'jalan'), 'HIGH', 'jalan inspeksi rabat beton harus HIGH untuk jalan');
    // Variasi redaksi lain tetap tertolak: "rabat beton" tanpa konteks lantai kerja.
    eq(lvl('Perkerasan Rabat Beton Jalan Lingkungan', 'rumah'), 'REJECTED', 'rabat beton jalan lingkungan tetap REJECTED');
    // Frasa lantai kerja saja: tidak ditolak (MEDIUM netral — bukan
    // signature jalan, bukan pula item inti yang dikenali sebagai HIGH).
    assert(
      lvl('Rabat Beton Lantai Kerja', 'rumah') !== 'REJECTED' &&
        lvl('Rabat Beton Lantai Kerja', 'rumah') !== 'LOW',
      'frasa lantai kerja saja lolos',
    );
  });
  await check('5E-03 matriks RAB rumah: 11 RAB, 275 item — NOL REJECTED/LOW', () => {
    // DIPERBARUI TERBUKA (Gelombang 2 §17.11, 2026-11-13): T54/T60/T90
    // kini terdaftar di master registry → jalur direct tersusun 4→7
    // (36-1FL, 36-2FL, 45, 54, 60, 70, 90); 'type 54' pindah dari
    // specTexts ke direct (parseFreeSpec menolak tipe terdaftar) dan
    // contoh tipe BELUM terdaftar diganti 'type 100'. Total 8→11 RAB,
    // 200→275 item (25 item per RAB — daftar kerja bersama).
    const directTexts: string[] = [];
    for (const h of HouseTypeCatalog.getAll()) {
      if (!h.templateId || h.area == null) continue;
      directTexts.push(`buatkan rab rumah type ${h.area} ${h.defaultFloorCount} lantai`);
    }
    const specTexts = [
      'buatkan rab rumah 5x10',
      'buatkan rab rumah luas bangunan 50 m2 dua lantai di Bogor',
      // '2 lantai' wajib: tanpa lantai, fallback tipe terdekat R1
      // menangkap 'type 100' lewat luas 100 m² (basis T70) dan
      // merutekannya ke jalur direct (bukan spek bebas).
      'buatkan rab rumah type 100 2 lantai',
      'buatkan rab rumah 6x12 m 1 lantai',
    ];
    let total = 0;
    const bad: string[] = [];
    let built = 0;
    const scan = (label: string, items: Array<{ name: string }>) => {
      built++;
      for (const it of items) {
        total++;
        const v = lvl(it.name, 'rumah');
        if (v === 'REJECTED' || v === 'LOW') bad.push(`${label} :: ${it.name} → ${v}`);
      }
    };
    for (const t of directTexts) {
      const r = buildDirectRab(t);
      // Celah katalog pra-ada (menyusut sejak §17.11): beberapa tipe
      // (kini 100+) punya templateId di HouseTypeCatalog tetapi template
      // itu tidak terdaftar di masterBuildingTemplateRegistry →
      // buildDirectRab null; specRab menutup tipe-tipe itu (diuji di
      // bawah). Yang dihitung: RAB yang benar-benar tersusun.
      if (!r) continue;
      scan(`direct ${t}`, r.calc.items);
    }
    for (const t of specTexts) {
      const r = buildSpecRab(t);
      assert(r, `spec harus tersusun: ${t}`);
      scan(`spec ${t}`, r!.calc.items);
    }
    eq(built, 11, 'harus 11 RAB rumah tersusun (7 direct + 4 spec)');
    eq(total, 275, 'harus 275 item diklasifikasi');
    eq(bad, [], `tidak boleh ada item rumah yang REJECTED/LOW: ${bad.slice(0, 3).join(' | ')}`);
  });
  await check('5E-04 panen katalog LIVE: nol item sendiri REJECTED/LOW (invarian Wave E)', () => {
    // Pemetaan Wave E (CAT_TO_PID) — disalin verbatim agar invarian
    // gelombang ini diuji ulang, bukan dipercaya dari laporan.
    const CAT_TO_PID: Record<string, string[]> = {
      INDUSTRI: ['gedung'], GEDUNG: ['gedung'], BANGUNAN_TINGGI: ['gedung'],
      HOTEL_HOSPITALITY: ['gedung'], KESEHATAN: ['gedung'], PENDIDIKAN: ['gedung'],
      RUMAH_TINGGAL: ['gedung'],
      PERTANIAN_PERKEBUNAN: ['kandang'],
      JALAN_TRANSPORTASI: ['jalan'], PERKERASAN: ['jalan'],
      DRAINASE_SANITASI: ['drainase'], SDA_IRIGASI: ['drainase', 'irigasi'],
      LANDSCAPE_SITE: ['lanskap', 'pagar-gerbang'],
      JEMBATAN_STRUKTUR: ['jembatan'], RENOVASI_MAINTENANCE: ['renovasi'],
      PELABUHAN_PESISIR: ['pelabuhan'], PEKERJAAN_TANAH: ['pekerjaan-tanah'],
      PONDASI_GEOTEKNIK: ['pondasi'],
    };
    const svc = RabTemplateService.getInstance();
    const violations: string[] = [];
    let checked = 0;
    let ungatedTemplates = 0;
    for (const t of svc.getAllTemplates()) {
      const pids = CAT_TO_PID[t.category];
      const isPool = t.id === 'SPT-SWIMMING-POOL';
      const myPids = isPool ? ['kolam'] : pids;
      if (!myPids) { ungatedTemplates++; continue; }
      const params: Record<string, number> = {};
      for (const p of (t.parameters || []) as any[]) {
        const d = (p as any).defaultValue ?? (p as any).default ?? (p as any).min ?? 1;
        if (typeof d === 'number') params[p.key] = d;
      }
      const g: any = svc.generateRabFromTemplate(t as any, params, undefined, 'PROFESSIONAL', []);
      for (const pid of myPids) {
        for (const item of g.items || []) {
          checked++;
          const v = lvl(item.description, pid);
          if (v === 'REJECTED' || v === 'LOW') {
            violations.push(`[${pid}] ${t.id} :: ${item.description} → ${v}`);
          }
        }
      }
    }
    assert(checked > 1000, `panen harus memeriksa >1000 pasangan, dapat ${checked}`);
    assert(ungatedTemplates > 0, 'harus ada template tak-tergerbang yang dilewati eksplisit');
    eq(violations, [], `nol pelanggaran: ${violations.slice(0, 3).join(' | ')}`);
  });
  await check('5E-05 matriks kontaminan Wave E tetap tertolak + keputusan disengaja tetap lolos', () => {
    const ROAD = [
      'Lapis Aus Aspal Beton AC-WC t=4 cm Padat',
      'Lapis Resap Pengikat (Prime Coat) 0.8 L/m²',
      'Pemasangan Paving Block K-300 Komplit Pasir Pengisi (Abu Batu)',
      'Marka Garis Tepi & Tengah Jalan Termoplastik 12 cm',
    ];
    const INTERIOR = [
      'Plafon Gypsum Board Tebal 9 mm & Rangka Hollow',
      'Kloset Duduk Monoblok per Kamar Mandi',
    ];
    const POOL = [
      'Keramik Kolam & Waterline (Pemasangan Keramik Dinding setara Paket Kolam)',
      'Waterproofing Coating Dinding & Lantai Kolam',
    ];
    const SYSTEM = ['Outlet Gas Medis per Bedhead (O₂ + Vakum + Udara)'];
    const KEET = 'Pembuatan Direksi Keet';
    // Kandang: semua keluarga kontaminan tertolak.
    for (const i of [...ROAD, ...INTERIOR, ...POOL, ...SYSTEM, KEET]) {
      eq(lvl(i, 'kandang'), 'REJECTED', `kandang harus menolak ${i}`);
    }
    // Kolam: aspal/interior/keet tertolak; item kolam sendiri lolos.
    for (const i of [...ROAD, ...INTERIOR, KEET]) eq(lvl(i, 'kolam'), 'REJECTED', `kolam harus menolak ${i}`);
    for (const i of POOL) assert(lvl(i, 'kolam') !== 'REJECTED', `kolam harus menerima ${i}`);
    // Jalan: interior/kolam/gas medis tertolak; item jalan sendiri lolos.
    for (const i of [...INTERIOR, ...POOL, ...SYSTEM]) eq(lvl(i, 'jalan'), 'REJECTED', `jalan harus menolak ${i}`);
    eq(lvl(ROAD[0], 'jalan'), 'HIGH', 'jalan harus menerima aspal sendiri');
    // Drainase: interior/kolam tertolak; keluarga jalan TIDAK ditolak (cross-drain sah).
    for (const i of [...INTERIOR, ...POOL]) eq(lvl(i, 'drainase'), 'REJECTED', `drainase harus menolak ${i}`);
    assert(lvl(ROAD[2], 'drainase') !== 'REJECTED', 'drainase harus menerima paving (cross-drain)');
    // Irigasi: "kolam retensi" lolos (bangunan air, bukan kolam renang).
    assert(
      lvl('Galian Tanah Kolam Retensi Menggunakan Excavator', 'irigasi') !== 'REJECTED',
      'kolam retensi harus lolos untuk irigasi',
    );
    // Lanskap: sistem aspal tertolak; paving/kanstin hardscape lolos.
    eq(lvl(ROAD[0], 'lanskap'), 'REJECTED', 'lanskap harus menolak aspal');
    assert(lvl('Pemasangan Paving Dekoratif Plaza Pejalan Kaki', 'lanskap') !== 'REJECTED', 'paving taman lolos');
    assert(lvl('Kanstin Pembatas Taman & Rumput', 'lanskap') !== 'REJECTED', 'kanstin taman lolos');
    // Jembatan: interior/kolam tertolak; trotoar lantai jembatan lolos.
    for (const i of [...INTERIOR, ...POOL]) eq(lvl(i, 'jembatan'), 'REJECTED', `jembatan harus menolak ${i}`);
    assert(lvl('Beton Lantai Kendaraan & Trotoar fc 15 MPa', 'jembatan') !== 'REJECTED', 'trotoar jembatan lolos');
    // Renovasi: aspal/kolam tertolak; interior renovasi lolos (inti renovasi).
    for (const i of [ROAD[0], ...POOL]) eq(lvl(i, 'renovasi'), 'REJECTED', `renovasi harus menolak ${i}`);
    assert(lvl('Penggantian Plafon Gypsum 9mm Rangka Hollow Baru', 'renovasi') !== 'REJECTED', 'plafon renovasi lolos');
    // Pekerjaan-tanah: "badan jalan" lolos (keputusan kalibrasi disengaja).
    assert(
      lvl('Timbunan Tanah Biasa Badan Jalan (Urugan Liat setara, Berlapis)', 'pekerjaan-tanah') !== 'REJECTED',
      'badan jalan lolos untuk pekerjaan-tanah',
    );
    // Cakupan eksplisit pengguna selalu menang atas gerbang.
    assert(lvl(ROAD[2], 'kandang', ['jalan']) !== 'REJECTED', 'jalan eksplisit membebaskan paving');
    assert(lvl(INTERIOR[0], 'kandang', ['finishing']) !== 'REJECTED', 'finishing eksplisit membebaskan interior');
  });

  console.log('== 5E-06..10 — gerbang relevansi pada jalur direct/spec ==');
  await check('5E-06 buildDirectRab T70 2 lantai: identik mesin mentah, Rabat Beton hadir, 0 catatan gerbang', () => {
    const r = buildDirectRab('buatkan rab rumah type 70 2 lantai');
    assert(r, 'direct harus tersusun');
    const raw = parametricVolumeEngine.calculate({
      templateId: r!.calc.templateId,
      parameters: r!.generation.parametersUsed,
      region: r!.region,
    } as never);
    eq(r!.calc.items.length, raw.items.length, 'jumlah item = mesin mentah (gerbang tidak membuang apa pun)');
    eq(r!.calc.totalDirectCost, raw.totalDirectCost, 'total langsung = mesin mentah');
    eq(r!.calc.totalRabCost, raw.totalRabCost, 'total RAB = mesin mentah');
    assert(
      r!.calc.items.some((i) => i.name.includes('Rabat Beton Lantai Kerja')),
      'Rabat Beton Lantai Kerja harus hadir di hasil direct',
    );
    assert(
      !r!.warnings.some((w) => w.includes('Gerbang relevansi')),
      `direct sah tidak boleh memuat catatan gerbang: ${r!.warnings.join(' | ')}`,
    );
  });
  await check('5E-07 buildSpecRab 5x10: identik mesin mentah, Rabat Beton hadir, 0 catatan gerbang', () => {
    const r = buildSpecRab('buatkan rab rumah 5x10');
    assert(r, 'spec harus tersusun');
    const raw = parametricVolumeEngine.calculate({
      templateId: r!.calc.templateId,
      parameters: r!.generation.parametersUsed,
      region: r!.region,
    } as never);
    eq(r!.calc.items.length, raw.items.length, 'jumlah item = mesin mentah');
    eq(r!.calc.totalDirectCost, raw.totalDirectCost, 'total langsung = mesin mentah');
    eq(r!.calc.totalRabCost, raw.totalRabCost, 'total RAB = mesin mentah');
    assert(
      r!.calc.items.some((i) => i.name.includes('Rabat Beton Lantai Kerja')),
      'Rabat Beton Lantai Kerja harus hadir di hasil spec',
    );
    assert(
      !r!.warnings.some((w) => w.includes('Gerbang relevansi')),
      `spec sah tidak boleh memuat catatan gerbang: ${r!.warnings.join(' | ')}`,
    );
  });
  await check('5E-08 kontaminan injeksi pada direct: dihapus dari item+workItem+subtotal, total kembali ke asal', () => {
    const r = buildDirectRab('buatkan rab rumah type 70 2 lantai');
    assert(r, 'direct harus tersusun');
    // Klon hasil, lalu injeksikan SATU item kontaminan jalan (tidak pernah
    // ada di RAB rumah — simulasi mesin yang salah memilih item).
    const calc: any = JSON.parse(JSON.stringify(r!.calc));
    const gen: any = JSON.parse(JSON.stringify(r!.generation));
    const fakeItem = {
      name: 'Perkerasan aspal AC-WC jalan lingkungan',
      volume: 10, unit: 'm2', unitPrice: 100000, totalPrice: 1000000,
      category: '15_INFRASTRUKTUR_JALAN', wbsCode: '9.9.9.9', priceStatus: 'OFFICIAL',
    };
    const fakeWork = {
      workItemId: 'fake-1', wbsCode: '9.9.9.9', name: fakeItem.name,
      category: '15_INFRASTRUKTUR_JALAN', unit: 'm2', quantity: 10,
      unitPrice: 100000, totalPrice: 1000000, priceStatus: 'OFFICIAL',
      formula: 'x', formulaInputs: {}, assumptionsUsed: [], status: 'ok',
      confidence: 0.9, requiresReview: false, warnings: [], errors: [],
      calculationTrace: [],
    };
    calc.items.push(fakeItem);
    gen.workItems.push(fakeWork);
    calc.generationResult = gen;
    const gated = applyRelevanceGateToDirectCalc(calc, 'buatkan rab rumah type 70 2 lantai');
    eq(gated.removed, 1, 'tepat 1 kontaminan dihapus');
    assert(gated.removedNames[0].includes('aspal AC-WC'), 'nama kontaminan tercatat');
    assert(gated.notes.some((n) => n.includes('Gerbang relevansi')), 'catatan gerbang hadir');
    assert(
      !gated.calc.items.some((i: any) => i.name.includes('aspal AC-WC')),
      'kontaminan tidak boleh ada di items hasil',
    );
    assert(
      !gated.calc.generationResult.workItems.some((w: any) => w.name.includes('aspal AC-WC')),
      'kontaminan tidak boleh ada di workItems hasil',
    );
    // Total kembali persis ke total asal (kontaminan seolah tidak pernah ada).
    eq(gated.calc.totalDirectCost, r!.calc.totalDirectCost, 'total langsung = total asal');
    eq(gated.calc.totalRabCost, r!.calc.totalRabCost, 'total RAB = total asal');
    eq(gated.calc.items.length, r!.calc.items.length, 'jumlah item = asal');
    // Konsistensi internal: total langsung = Σ harga total item.
    const sum = gated.calc.items.reduce((s: number, i: any) => s + (i.totalPrice ?? 0), 0);
    eq(gated.calc.totalDirectCost, sum, 'total langsung = Σ totalPrice item');
    // Payload push ikut bersih (push membaca hasil tergate).
    const push = mapDirectRabPushItems({ ...r!, calc: gated.calc, generation: gated.calc.generationResult });
    assert(!push.some((p) => p.description.includes('aspal AC-WC')), 'payload push tidak memuat kontaminan');
    eq(
      push.length,
      gated.calc.generationResult.workItems.filter((w: any) => w.quantity > 0).length,
      'panjang payload push = workItems tergate berkuantitas > 0',
    );
  });
  await check('5E-09 cakupan jalan eksplisit membebaskan kontaminan pada direct', () => {
    const r = buildDirectRab('buatkan rab rumah type 70 2 lantai');
    assert(r, 'direct harus tersusun');
    const calc: any = JSON.parse(JSON.stringify(r!.calc));
    const gen: any = JSON.parse(JSON.stringify(r!.generation));
    calc.items.push({
      name: 'Perkerasan aspal AC-WC jalan lingkungan',
      volume: 10, unit: 'm2', unitPrice: 100000, totalPrice: 1000000,
      category: '15_INFRASTRUKTUR_JALAN', wbsCode: '9.9.9.9', priceStatus: 'OFFICIAL',
    });
    gen.workItems.push({
      workItemId: 'fake-1', wbsCode: '9.9.9.9', name: 'Perkerasan aspal AC-WC jalan lingkungan',
      category: '15_INFRASTRUKTUR_JALAN', unit: 'm2', quantity: 10,
      unitPrice: 100000, totalPrice: 1000000, priceStatus: 'OFFICIAL',
      formula: 'x', formulaInputs: {}, assumptionsUsed: [], status: 'ok',
      confidence: 0.9, requiresReview: false, warnings: [], errors: [],
      calculationTrace: [],
    });
    calc.generationResult = gen;
    const gated = applyRelevanceGateToDirectCalc(
      calc,
      'buatkan rab rumah type 70 2 lantai dengan jalan lingkungan 50 m',
    );
    eq(gated.removed, 0, 'dengan cakupan jalan eksplisit, kontaminan dipertahankan');
    assert(
      gated.calc.items.some((i: any) => i.name.includes('aspal AC-WC')),
      'item jalan eksplisit harus hadir di hasil',
    );
  });
  await check('5E-10 pengaman: gerbang yang mengosongkan hasil tidak diterapkan', () => {
    const r = buildDirectRab('buatkan rab rumah type 70 2 lantai');
    assert(r, 'direct harus tersusun');
    const calc: any = JSON.parse(JSON.stringify(r!.calc));
    const gen: any = JSON.parse(JSON.stringify(r!.generation));
    // Hasil hipotetis yang SELURUH itemnya kontaminan jalan.
    calc.items = [{
      name: 'Perkerasan aspal AC-WC jalan lingkungan',
      volume: 10, unit: 'm2', unitPrice: 100000, totalPrice: 1000000,
      category: '15_INFRASTRUKTUR_JALAN', wbsCode: '9.9.9.9', priceStatus: 'OFFICIAL',
    }];
    gen.workItems = [{
      workItemId: 'fake-1', wbsCode: '9.9.9.9', name: 'Perkerasan aspal AC-WC jalan lingkungan',
      category: '15_INFRASTRUKTUR_JALAN', unit: 'm2', quantity: 10,
      unitPrice: 100000, totalPrice: 1000000, priceStatus: 'OFFICIAL',
      formula: 'x', formulaInputs: {}, assumptionsUsed: [], status: 'ok',
      confidence: 0.9, requiresReview: false, warnings: [], errors: [],
      calculationTrace: [],
    }];
    calc.generationResult = gen;
    const gated = applyRelevanceGateToDirectCalc(calc, 'buatkan rab rumah type 70 2 lantai');
    eq(gated.removed, 0, 'pengaman: tidak ada item dihapus');
    assert(gated.calc === calc, 'pengaman: hasil asal dikembalikan apa adanya');
    assert(gated.notes.some((n) => n.includes('hasil asal dipertahankan')), 'pengaman: catatan pengaman hadir');
  });

  console.log('== 5E-11..16 — part atap mandiri pada alur tanpa-spek ==');
  await check('5E-11 kandang tanpa-spek: 1 part (kandang), Galvalum dihormati, tanpa part atap mandiri', () => {
    const res = rab.buildUniversalDraft(KANDANG_A);
    assert(res.kind === 'draft', `draft harus tersusun, dapat ${res.kind}`);
    if (res.kind !== 'draft') return;
    eq(res.draft.parts.length, 1, 'tepat 1 part (kandang saja)');
    eq(res.draft.parts[0].template.id, 'AGR-LIVESTOCK-BARN', 'template kandang');
    const items = rab.effectiveItems(res.draft);
    assert(
      items.some((i) => i.description === 'Penutup Atap Galvalum Kandang'),
      `item Penutup Atap Galvalum Kandang harus hadir: ${items.map((i) => i.description).join(' | ')}`,
    );
    assert(
      !items.some((i) => /Dak Beton|Green Roof|Atap Hijau/i.test(i.description)),
      'tidak boleh ada item dak beton/green roof dari part atap mandiri',
    );
    const warn = res.draft.warnings.join('\n');
    assert(warn.includes('tidak dibangun terpisah'), 'peringatan penekanan atap hadir');
    assert(warn.includes('Penutup Atap Galvalum Kandang'), 'peringatan menyebut varian Galvalum yang dipakai');
    const asm = res.draft.assumptions.join('\n');
    assert(asm.includes('Material Penutup Atap = galvalum'), 'asumsi menyebut override galvalum');
    assert(!asm.includes('(dari jawaban Anda)'), 'teks asumsi tidak menggandakan sufiks sumber');
  });
  await check('5E-12 gudang tanpa-spek: 1 part (gudang), tanpa part atap, cladding disebut', () => {
    const res = rab.buildUniversalDraft(GUDANG_B);
    assert(res.kind === 'draft', `draft harus tersusun, dapat ${res.kind}`);
    if (res.kind !== 'draft') return;
    eq(res.draft.parts.length, 1, 'tepat 1 part (gudang saja)');
    eq(res.draft.parts[0].template.id, 'BLD-IND-WAREHOUSE', 'template gudang');
    const items = rab.effectiveItems(res.draft);
    assert(
      items.some((i) => i.description.includes('Cladding Spandek')),
      'item cladding spandek gudang harus hadir',
    );
    const warn = res.draft.warnings.join('\n');
    assert(warn.includes('tidak dibangun terpisah'), 'peringatan penekanan atap hadir');
    assert(warn.includes('Cladding Spandek'), 'peringatan menyebut komponen penutup gudang');
    assert(!warn.includes('tidak menawarkan'), 'spandek ditawarkan gudang — tanpa peringatan material');
  });
  await check('5E-13 atap mandiri saja: part atap tetap dibangun, close-call tercatat', () => {
    const res = rab.buildUniversalDraft('buatkan RAB atap luas 120 m2');
    assert(res.kind === 'draft', `draft harus tersusun, dapat ${res.kind}`);
    if (res.kind !== 'draft') return;
    eq(res.draft.parts.length, 1, 'tepat 1 part (atap)');
    eq(res.draft.parts[0].scope.id, 'atap', 'part atap');
    assert(
      !res.draft.warnings.some((w) => w.includes('tidak dibangun terpisah')),
      'tanpa cakupan keluarga: tidak ada penekanan atap',
    );
    const asm = res.draft.assumptions.join('\n');
    assert(/selisih tipis|tidak tegas|close-call/i.test(asm), 'ketidaktegasan pilihan (seri 5 arah) tercatat di asumsi');
  });
  await check('5E-14 kandang + "atap dak beton": ditekan + peringatan material tidak ditawarkan', () => {
    const res = rab.buildUniversalDraft('kandang sapi terbuka 17x9 m, 30 ekor, atap dak beton, lantai beton miring');
    assert(res.kind === 'draft', `draft harus tersusun, dapat ${res.kind}`);
    if (res.kind !== 'draft') return;
    eq(res.draft.parts.length, 1, 'tetap 1 part (kandang) — dak beton tidak membangkitkan part atap');
    eq(res.draft.parts[0].template.id, 'AGR-LIVESTOCK-BARN', 'template kandang');
    const items = rab.effectiveItems(res.draft);
    assert(
      items.some((i) => i.description === 'Penutup Atap Spandek Kandang'),
      'tanpa varian dak beton: atap kandang memakai default spandek',
    );
    const warn = res.draft.warnings.join('\n');
    assert(warn.includes('tidak ditawarkan'), 'peringatan material tidak ditawarkan hadir');
    assert(warn.includes('dak beton'), 'peringatan menyebut material yang diminta');
  });
  await check('5E-15 alur berspek tidak berubah: suppression spek tetap berlaku, tanpa peringatan 5E', () => {
    const specs = [{
      key: 'kandang-roof-material', kind: 'material' as const, label: 'Material atap kandang',
      value: 'Galvalum', status: 'CONFIRMED' as const, source: 'kuesioner' as const,
      updatedAt: NOW,
    }];
    const res = rab.buildUniversalDraft(KANDANG_A, undefined, { structuredSpecs: specs });
    assert(res.kind === 'draft', `draft harus tersusun, dapat ${res.kind}`);
    if (res.kind !== 'draft') return;
    eq(res.draft.parts.length, 1, 'tetap 1 part (kandang)');
    const items = rab.effectiveItems(res.draft);
    assert(
      items.some((i) => i.description === 'Penutup Atap Galvalum Kandang'),
      'alur berspek: Galvalum tetap dihormati',
    );
    const warn = res.draft.warnings.join('\n');
    assert(warn.includes('sudah tercakup komponen template kandang'), 'peringatan suppression spek hadir');
    assert(
      !warn.includes('Kandang Ternak Modern Terbuka'),
      'alur berspek tidak boleh memakai redaksi penekanan tanpa-spek (5E)',
    );
  });
  await check('5E-16 templateDeclaresRoof: penutup didahulukan, rangka/bongkar/tanaman bukan penutup', () => {
    const svc = RabTemplateService.getInstance();
    const byId = (id: string) => svc.getAllTemplates().find((t) => t.id === id)!;
    const barn = rab.templateDeclaresRoof(byId('AGR-LIVESTOCK-BARN'));
    eq(barn.covered, true, 'kandang: atap tercakup');
    eq(barn.componentName, 'Penutup Atap Spandek Kandang', 'kandang: penutup didahulukan atas rangka');
    const wh = rab.templateDeclaresRoof(byId('BLD-IND-WAREHOUSE'));
    eq(wh.covered, true, 'gudang: atap tercakup');
    assert((wh.componentName ?? '').includes('Cladding Spandek'), 'gudang: komponen cladding');
    const mt = rab.templateDeclaresRoof(byId('BLD-IND-MULTITENANT'));
    eq(mt.covered, true, 'multi-tenant: atap tercakup');
    // Green roof ADALAH template atap (dak + waterproofing + drainase
    // adalah pekerjaan atap sungguhan) — tercakup dengan benar.
    const green = rab.templateDeclaresRoof(byId('ROOF-GREEN-GARDEN'));
    eq(green.covered, true, 'green roof: template atap sungguhan, tercakup');
    const road = rab.templateDeclaresRoof(byId('INFRA-ROAD-ASPHALT'));
    eq(road.covered, false, 'jalan aspal: tanpa komponen atap');
    // Pengecualian tanaman/bongkar (defensif — tidak ada template hidup
    // yang hanya punya komponen itu): diuji sebagai unit murni.
    const tanamanOnly = rab.templateDeclaresRoof({
      id: 'FAKE-TANAMAN', components: [{ name: 'Tanaman Atap Hijau Sedum' }],
    } as never);
    eq(tanamanOnly.covered, false, 'tanaman atap saja BUKAN cakupan atap');
    const bongkarOnly = rab.templateDeclaresRoof({
      id: 'FAKE-BONGKAR', components: [{ name: 'Pembongkaran Penutup Atap Lama' }],
    } as never);
    eq(bongkarOnly.covered, false, 'bongkar atap saja BUKAN cakupan atap');
    // Template renovasi atap: komponen bongkar dilewati, penutup baru dipakai.
    const reno = rab.templateDeclaresRoof(byId('RENOV-ROOF-REPLACEMENT'));
    eq(reno.covered, true, 'renovasi atap: atap tercakup');
    eq(reno.componentName, 'Penutup Atap Zincalume Baru', 'renovasi atap: penutup baru, bukan bongkar');
  });

  console.log('== 5E-17..20 — alasan tertelusur per komponen ==');
  await check('5E-17 trace draft berspek kandang: Galvalum = SPEK_USER, hitungan konsisten, 0 UNRESOLVED', () => {
    const specs = [{
      key: 'kandang-roof-material', kind: 'material' as const, label: 'Material atap kandang',
      value: 'Galvalum', status: 'CONFIRMED' as const, source: 'kuesioner' as const,
      updatedAt: NOW,
    }];
    const res = rab.buildUniversalDraft(KANDANG_A, undefined, { structuredSpecs: specs });
    assert(res.kind === 'draft', `draft harus tersusun, dapat ${res.kind}`);
    if (res.kind !== 'draft') return;
    const trace = chain.traceItemReasons(res.draft, specs);
    const roof = trace.items.find((i) => i.description === 'Penutup Atap Galvalum Kandang');
    assert(roof, 'jejak atap Galvalum harus ada');
    eq(roof!.source, 'SPEK_USER', 'atap Galvalum bersumber spek user');
    const total = trace.counts.spekUser + trace.counts.ded + trace.counts.template + trace.counts.unresolved;
    eq(total, trace.items.length, 'hitungan sumber = jumlah item');
    eq(trace.counts.total, trace.items.length, 'counts.total = jumlah item');
    eq(trace.counts.unresolved, 0, 'draft berspek sah: 0 item tanpa alasan');
    // Basis harga mencerminkan displayPriceStatus (bukan karangan).
    const priced = trace.items.filter((i) => i.priceBasis === 'AHSP_RESMI');
    assert(priced.length > 0, 'ada item berbasis harga AHSP_RESMI');
  });
  await check('5E-18 trace draft tanpa-spek + pesan memuat seksi Alasan komponen', () => {
    const res = rab.buildUniversalDraft(KANDANG_A);
    assert(res.kind === 'draft', `draft harus tersusun, dapat ${res.kind}`);
    if (res.kind !== 'draft') return;
    const trace = chain.traceItemReasons(res.draft, res.draft.structuredSpecs ?? []);
    eq(trace.counts.unresolved, 0, 'draft tanpa-spek sah: 0 item tanpa alasan');
    const msg = rab.formatUniversalDraftMessage(res.draft);
    assert(msg.includes('**Alasan komponen:**'), 'pesan memuat seksi Alasan komponen');
    assert(msg.includes(`${trace.items.length} item`), 'seksi menyebut jumlah item');
    assert(
      msg.includes('dari spek/dimensi Anda') || msg.includes('dari template resmi'),
      'seksi menyebut segmen sumber komponen',
    );
    if (trace.counts.assumptionVolume > 0) {
      assert(msg.includes('Volume berbasis asumsi default template'), 'baris volume-asumsi berlabel hadir');
    }
  });
  await check('5E-19 item donor tanpa komponen → UNRESOLVED dan disebut di pesan', () => {
    const res = rab.buildUniversalDraft(KANDANG_A);
    assert(res.kind === 'draft', `draft harus tersusun, dapat ${res.kind}`);
    if (res.kind !== 'draft') return;
    const draft: any = JSON.parse(JSON.stringify(res.draft));
    draft.parts[0].generation.items.push({
      id: 'fake-item-1', description: 'Zorblax kwintara fiktif',
      volume: 1, unit: 'ls', unitPrice: null, priceStatus: 'PRICE_UNRESOLVED',
    });
    const trace = chain.traceItemReasons(draft, []);
    const fake = trace.items.find((i) => i.description === 'Zorblax kwintara fiktif');
    assert(fake, 'jejak item donor harus ada');
    eq(fake!.source, 'UNRESOLVED', 'item donor tanpa komponen = UNRESOLVED');
    const msg = rab.formatUniversalDraftMessage(draft);
    assert(msg.includes('tanpa alasan tertelusur'), 'pesan menyebut item tanpa alasan tertelusur');
    assert(msg.includes('Zorblax kwintara fiktif'), 'pesan menyebut nama item donor');
  });
  await check('5E-20 tautan DED → sumber DED pada jejak komponen', () => {
    const res = rab.buildUniversalDraft('Buatkan RAB gedung 10 x 8 m 2 lantai');
    assert(res.kind === 'draft', `draft harus tersusun, dapat ${res.kind}`);
    if (res.kind !== 'draft') return;
    const items = rab.effectiveItems(res.draft);
    assert(items.length > 0, 'draft gedung harus punya item');
    const dedName = items[0].description;
    const trace = chain.traceItemReasons(res.draft, [], [dedName]);
    const linked = trace.items.find((i) => i.description === dedName);
    assert(linked, 'jejak item tautan DED harus ada');
    eq(linked!.source, 'DED', 'item yang ditautkan cek DED = sumber DED');
    assert((linked!.detail ?? '').includes('DED'), 'detail menyebut DED');
  });

  console.log('== 5E-21..22 — klarifikasi saat ambigu ==');
  await check('5E-21 atap mandiri tanpa bahan → gerbang material menanyakan bahan (bukan memilih diam-diam)', () => {
    storage.clear();
    reg.clearUniversalContext();
    rab.setLastUniversalDraft(null);
    const text = 'buatkan RAB atap luas 120 m2';
    const routed = routeIntent(text);
    const ctx = {
      navigate: () => undefined,
      currentMenu: 'ezrab-ai',
      activeProject: { id: PROJECT_5E, name: 'Proyek 5E' },
      projects: [],
      projectTotal: 0,
      projectItems: null,
      rawText: text,
    } as unknown as Parameters<typeof reg.executeIntent>[2];
    const res = reg.executeIntent(routed.intent, routed.param, ctx);
    assert(res && res.ok, `executeIntent harus ok, dapat ${JSON.stringify(res)?.slice(0, 200)}`);
    assert(
      (res.message ?? '').includes('bahannya perlu jelas'),
      `pesan harus menanyakan bahan atap: ${(res.message ?? '').slice(0, 200)}`,
    );
    assert((res.message ?? '').includes('120 m²'), 'pesan menyebut luas yang sudah jelas');
    const labels = (res.actions ?? []).map((a) => (a as { label: string }).label);
    assert(labels.includes('Metal standing seam + insulasi'), 'tombol pilihan standing seam hadir');
    assert(labels.includes('Susun saja — pakai asumsi terbuka'), 'tombol pakai-asumsi hadir (jalan keluar)');
    // Perilaku pra-ada: builder menyimpan draft tertunda (untuk lanjutan
    // tryContinueRabMaterial) — yang digerbang adalah PESAN, bukan
    // penyimpanan. Yang diuji: gerbang aktif (awaitRabMaterial) dan draft
    // tertunda adalah part atap yang belum dipilih bahannya.
    assert((res as { awaitRabMaterial?: boolean }).awaitRabMaterial === true, 'gerbang material aktif (awaitRabMaterial)');
    const pending = rab.getLastUniversalDraft(PROJECT_5E);
    assert(pending, 'draft tertunda tersimpan untuk lanjutan');
    eq(pending!.parts.length, 1, 'draft tertunda: 1 part');
    eq(pending!.parts[0].scope.id, 'atap', 'draft tertunda: part atap');
  });
  await check('5E-22 objek tak dikenal → needs-spec; jembatan tanpa material → BLOCKED', () => {
    const unknown = rab.buildUniversalDraft('buatkan rab sesuatu yang besar');
    eq(unknown.kind, 'needs-spec', 'objek tak dikenal harus meminta klarifikasi (needs-spec)');
    const j = rab.buildUniversalDraft('Buatkan RAB jembatan bentang 12 meter lebar 4 meter');
    assert(j.kind === 'draft', `jembatan harus tersusun, dapat ${j.kind}`);
    if (j.kind !== 'draft') return;
    const readiness = rab.draftReadiness(j.draft);
    eq(readiness.status, 'BLOCKED', 'jembatan tanpa material: BLOCKED');
    assert(
      readiness.blockedReasons.some((r) => r.includes('Material struktur jembatan belum ditentukan')),
      `alasan blokir harus menyebut material jembatan: ${readiness.blockedReasons.join(' | ')}`,
    );
  });

  console.log('== 5E-23 — komponen sah dipertahankan lintas kategori ==');
  await check('5E-23 draft sah 9 kategori: tersusun + NOL catatan gerbang', () => {
    const prompts: Array<[string, string]> = [
      ['kandang', 'Buatkan RAB kandang sapi untuk 50 ekor, ukuran 10 × 25 meter.'],
      ['kolam', 'Buatkan RAB kolam renang ukuran 8 × 4 meter kedalaman 1,4 meter.'],
      ['jalan', 'Buat RAB pembangunan jalan desa panjang 2 km dan lebar 4 meter.'],
      ['drainase', 'Buatkan RAB saluran drainase u-ditch panjang 300 meter.'],
      ['pagar', 'Buatkan RAB pagar tembok keliling panjang 80 meter tinggi 2 meter.'],
      ['taman', 'Buatkan RAB taman kawasan dan plaza publik seluas 1000 m².'],
      ['renovasi', 'Saya mau renovasi rumah lama seluas 90 m², fokus dapur dan kamar mandi.'],
      ['gudang', 'Buatkan RAB gudang 10 x 20 m.'],
      ['jembatan', 'Buatkan RAB jembatan bentang 12 meter lebar 4 meter.'],
    ];
    for (const [label, text] of prompts) {
      const b = rab.buildUniversalDraft(text);
      assert(b.kind === 'draft', `${label}: draft harus tersusun, dapat ${b.kind}`);
      if (b.kind !== 'draft') continue;
      const gateNotes = (b.draft.warnings ?? []).filter((w) => w.includes('Gerbang relevansi'));
      eq(gateNotes, [], `${label}: nol catatan gerbang pada draft sah`);
      assert(rab.effectiveItems(b.draft).length > 0, `${label}: draft harus punya item`);
    }
  });

  console.log('== 5E-24..25 — multi-gedung ==');
  await check('5E-24 contoh kanonis Gate 2: total identik Rp924.102.500, rekonsiliasi seimbang', () => {
    const res = rab.buildUniversalDraft(
      'buatkan RAB Gedung A 3 lantai 15 x 10 m + Gedung B 2 lantai 12 x 8 m, plus jalan akses sepanjang 50 m',
    );
    assert(res.kind === 'draft', `draft harus tersusun, dapat ${res.kind}`);
    if (res.kind !== 'draft') return;
    const rec = rab.reconcileMultiBuildingTotals(res.draft);
    eq(rec.projectTotal.estimatedTotal, 924102500, 'total proyek contoh kanonis');
    assert(rec.balanced, 'rekonsiliasi harus seimbang (B = 0)');
  });
  await check('5E-25 multi + atap: part atap TIDAK ditekan (gedung kantor tanpa cakupan atap PROFESSIONAL) + peringatan proyek', () => {
    const res = rab.buildUniversalDraft(
      'buatkan RAB Gedung A 3 lantai 15 x 10 m + Gedung B 2 lantai 12 x 8 m, atap genteng',
    );
    assert(res.kind === 'draft', `draft harus tersusun, dapat ${res.kind}`);
    if (res.kind !== 'draft') return;
    // DIPERBARUI TERBUKA (Gelombang 2 §17.3, 2026-11-13): batasan Gate 5
    // ("penekanan hanya single-building") SUDAH TIDAK BERLAKU — penekanan
    // kini multi-building dengan cakupan LEVEL-AWARE: gedung dihitung
    // tercakup atap HANYA bila template terpilihnya mendeklarasikan
    // komponen atap yang BENAR-BENAR ter-generate di PROFESSIONAL.
    // Gedung kantor (BLD-OFFICE-MULTI) hanya mendeklarasikan atap lewat
    // komponen COMPREHENSIVE-opsional yang tidak pernah muncul di draft
    // PROFESSIONAL — jadi TIDAK tercakup, part atap proyek tetap
    // dibangun, dan asersi di bawah tetap benar. Kasus penekanan yang
    // BENAR-BENAR menekan (gudang/sekolah) diuji di
    // chatPerbaikanSemuaG2B.test.ts (G2B-1).
    const atapParts = res.draft.parts.filter((p) => p.scope.id === 'atap');
    eq(atapParts.length, 1, 'multi-gedung: part atap tetap dibangun (tidak ditekan)');
    eq(atapParts[0].sectionKind, 'project', 'part atap multi-gedung dihitung di tingkat proyek');
    assert(
      res.draft.warnings.some((w) => w.includes('dihitung sekali di tingkat proyek')),
      'peringatan cakupan tingkat proyek harus hadir',
    );
  });

  console.log('== 5E-26 — gerbang regresi CASE B (Wave B T03) ==');
  await check('5E-26 CASE B gudang baja 20×40: template gudang, NOL item paving/geobag/keet/marka', () => {
    const text = 'Hitungkan estimasi pembangunan gudang baja ukuran 20 × 40 meter.';
    const b = rab.buildUniversalDraft(text);
    assert(b.kind === 'draft', `draft harus tersusun, dapat ${b.kind}`);
    if (b.kind !== 'draft') return;
    assert(b.draft.parts[0].template.name.includes('Gudang'), 'template gudang');
    const descs = rab.effectiveItems(b.draft).map((i) => i.description.toLowerCase());
    assert(descs.length > 0, 'draft harus punya item');
    for (const d of descs) {
      assert(!d.includes('paving'), `tanpa paving: ${d}`);
      assert(!d.includes('geobag'), `tanpa geobag: ${d}`);
      assert(!d.includes('direksi keet'), `tanpa direksi keet: ${d}`);
      assert(!d.includes('marka jalan'), `tanpa marka jalan: ${d}`);
      assert(
        gate.classifyItemRelevance(d, 'gudang-industri').level !== 'REJECTED',
        `item gudang tidak boleh REJECTED: ${d}`,
      );
    }
  });

  console.log('== S5E — asersi sumber (wiring nyata, bukan mock) ==');
  await check('S5E gerbang direct/spec terpanggil di builder + tanpa panggilan provider', () => {
    const directSrc = readFileSync(new URL('../ai-tools/ezrab-ai/directRab.ts', import.meta.url), 'utf8');
    assert(directSrc.includes('applyRelevanceGateToDirectCalc'), 'directRab memakai gerbang direct');
    const specSrc = readFileSync(new URL('../ai-tools/ezrab-ai/specRab.ts', import.meta.url), 'utf8');
    assert(specSrc.includes('applyRelevanceGateToDirectCalc'), 'specRab memakai gerbang direct');
    const gateSrc = readFileSync(new URL('../ai-tools/ezrab-ai/directRabGate.ts', import.meta.url), 'utf8');
    assert(!/fetch\s*\(/.test(gateSrc), 'directRabGate tidak memanggil fetch');
    assert(!/providerClient/.test(gateSrc), 'directRabGate tidak memakai providerClient');
    assert(!/axios/.test(gateSrc), 'directRabGate tidak memakai axios');
    assert(gateSrc.includes('totalRabCost'), 'directRabGate menghitung ulang total RAB');
    assert(gateSrc.includes('categorySubtotals'), 'directRabGate menghitung ulang subtotal kategori');
    const relevanceSrc = readFileSync(new URL('../ai-tools/ezrab-ai/relevanceGate.ts', import.meta.url), 'utf8');
    assert(relevanceSrc.includes('scrubLantaiKerjaRabat'), 'relevanceGate memuat kalibrasi lantai kerja');
  });
  await check('S5E penekanan atap + jejak alasan terpasang di universalRab/specChain', () => {
    const rabSrc = readFileSync(new URL('../ai-tools/ezrab-ai/universalRab.ts', import.meta.url), 'utf8');
    assert(rabSrc.includes('computeNoSpecRoofSuppression'), 'universalRab memuat penekanan atap tanpa-spek');
    assert(rabSrc.includes('templateDeclaresRoof'), 'universalRab memuat detektor cakupan atap');
    assert(rabSrc.includes('traceItemReasons'), 'universalRab memanggil traceItemReasons');
    assert(rabSrc.includes('formatItemReasonSummary'), 'universalRab memanggil formatItemReasonSummary');
    const chainSrc = readFileSync(new URL('../ai-tools/ezrab-ai/specChain.ts', import.meta.url), 'utf8');
    assert(chainSrc.includes('export function traceItemReasons'), 'specChain mengekspor traceItemReasons');
    assert(chainSrc.includes('UNRESOLVED'), 'specChain memuat sumber UNRESOLVED');
  });

  console.log(`\nchatPhase5Relevance: ${passed} lolos, ${failed} gagal${failures.length > 0 ? ` — gagal: ${failures.join(', ')}` : ''}`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((e: unknown) => {
  console.error(e);
  process.exitCode = 1;
});

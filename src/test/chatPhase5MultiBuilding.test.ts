/**
 * chatPhase5MultiBuilding.test.ts — GATE 2 (5B): True Multi-Building RAB
 * (Phase 5 Workflow Integration, direktif owner 2026-11-12 11:45 WIB §4 +
 * §10 Gate 2).
 *
 * Gaya plain-tsx: `npx --yes tsx src/test/chatPhase5MultiBuilding.test.ts`
 *
 * Setiap tes memakai JALUR NYATA (parser + mesin template + registry
 * revisi + persistensi), bukan mock jalur. Simulasi "reload" = bersihkan
 * singleton in-memory TANPA menyentuh storage (pola Gate 1).
 *
 * Contoh kanonis multi-gedung (dipakai suite + E2E):
 *   Gedung A 3 lantai 15 x 10 m (= 150 m²) + Gedung B 2 lantai
 *   12 x 8 m (= 96 m²) + jalan akses sepanjang 50 m (shared works).
 * Total proyek yang diharapkan: Rp 924.102.500 (A Rp 461.492.500 +
 * B Rp 288.520.000 + jalan Rp 174.090.000) — angka dicatat apa adanya
 * dari engine, bukan target yang dipaksa (tes menegaskan REKONSILIASI,
 * bukan angka mutlak).
 *
 * Klasifikasi per ID: VERIFIED PASS / VERIFIED FAIL / PARTIAL /
 * BLOCKED / NOT RUN (lihat laporan gate2-multi-building.md).
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
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    },
    raw: map,
  };
}
const storage = makeStorage();
(globalThis as Record<string, unknown>).localStorage = storage;

/** Contoh kanonis multi-gedung (satu shared scope berpanjang). */
const MULTI_TEXT =
  'buatkan RAB Gedung A 3 lantai 15 x 10 m + Gedung B 2 lantai 12 x 8 m, plus jalan akses sepanjang 50 m';

/** Buang blok ringkasan per-bangunan dari pesan (untuk perbandingan golden). */
function stripBuildingLines(msg: string): string {
  const lines = msg.split('\n');
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('Bangunan (per bangunan')) {
      // Buang header + bullet gedung yang langsung mengikutinya. Bullet
      // gedung SELALU menyebut 'lantai' (N lantai / jumlah lantai belum
      // diketahui) — bullet header lain (Template terpilih, Status
      // draft, …) tidak, sehingga tidak ikut terbuang.
      i++;
      while (i < lines.length && lines[i].startsWith('• ') && lines[i].includes('lantai')) i++;
      i--;
      continue;
    }
    out.push(lines[i]);
  }
  return out.join('\n');
}

async function main(): Promise<void> {
  console.log('chatPhase5MultiBuilding.test (GATE 2 / 5B)');
  const rab = await import('../ai-tools/ezrab-ai/universalRab');
  const mb = await import('../ai-tools/ezrab-ai/multiBuilding');
  const mbr = await import('../ai-tools/ezrab-ai/multiBuildingRab');
  const dp = await import('../ai-tools/ezrab-ai/draftPersistence');
  const intake = await import('../ai-tools/ezrab-ai/universalIntake');
  const chain = await import('../ai-tools/ezrab-ai/specChain');

  type Draft = ReturnType<typeof rab.buildUniversalDraft> extends { kind: 'draft'; draft: infer D }
    ? D
    : never;

  const buildMulti = (text: string = MULTI_TEXT): Draft => {
    const res = rab.buildUniversalDraft(text);
    assert(res.kind === 'draft', `buildMulti: kind=${res.kind} (${JSON.stringify(res).slice(0, 300)})`);
    return (res as { kind: 'draft'; draft: Draft }).draft;
  };
  const partFor = (draft: Draft, buildingId: string) =>
    draft.parts.find((p) => p.buildingId === buildingId);
  const sectionTotal = (draft: Draft, key: string) =>
    rab.computeSectionTotals(draft).find((s) => s.key === key);

  /* ============ 5B-01 — dimensi independen per gedung ============ */
  await check('5B-01 dimensi berbeda per gedung tetap independen', () => {
    const d = buildMulti();
    const a = partFor(d, 'gedung-a');
    const b = partFor(d, 'gedung-b');
    assert(a && b, 'kedua gedung harus punya part');
    eq(a.evaluatedParams.building_area, 150, 'Gedung A: building_area');
    eq(b.evaluatedParams.building_area, 96, 'Gedung B: building_area');
    const ma = d.buildings!.find((x) => x.id === 'gedung-a')!;
    const mbb = d.buildings!.find((x) => x.id === 'gedung-b')!;
    eq([ma.lengthM, ma.widthM, ma.buildingAreaM2], [15, 10, 150], 'model Gedung A');
    eq([mbb.lengthM, mbb.widthM, mbb.buildingAreaM2], [12, 8, 96], 'model Gedung B');
    // Spek per part membawa dimensi gedungnya sendiri, bukan proyek.
    eq(a.spec?.areaM2, 150, 'part A spec.areaM2');
    eq(b.spec?.areaM2, 96, 'part B spec.areaM2');
    // Tampilan mengikuti urutan tulis pengguna ('15 x 10', bukan '10 x 15').
    const msg = rab.formatUniversalDraftMessage(d);
    assert(msg.includes('Gedung A: 3 lantai; 15 m × 10 m; luas 150 m²'), 'tampilan A urutan tulis');
    assert(msg.includes('Gedung B: 2 lantai; 12 m × 8 m; luas 96 m²'), 'tampilan B urutan tulis');
  });

  /* ============ 5B-02 — lantai independen + revisi (CHAT-03) ============ */
  await check('5B-02 lantai berbeda per gedung tetap independen (revisi CHAT-03)', () => {
    const d = buildMulti();
    eq(partFor(d, 'gedung-a')!.evaluatedParams.num_floors, 3, 'A 3 lantai');
    eq(partFor(d, 'gedung-b')!.evaluatedParams.num_floors, 2, 'B 2 lantai');
    const aTotalBefore = sectionTotal(d, 'gedung-a')!.totals.estimatedTotal;
    const aParamsBefore = JSON.stringify(partFor(d, 'gedung-a')!.evaluatedParams);
    const aItemsBefore = JSON.stringify(partFor(d, 'gedung-a')!.generation.items);
    const rev = rab.reviseUniversalDraft(d, 'gedung B jadi 4 lantai');
    assert(rev && rev.ok && rev.changed, `revisi B→4 lantai harus berhasil (${JSON.stringify(rev)})`);
    eq(partFor(d, 'gedung-b')!.evaluatedParams.num_floors, 4, 'B menjadi 4 lantai');
    eq(partFor(d, 'gedung-a')!.evaluatedParams.num_floors, 3, 'A tetap 3 lantai');
    eq(JSON.stringify(partFor(d, 'gedung-a')!.evaluatedParams), aParamsBefore, 'params A utuh');
    eq(JSON.stringify(partFor(d, 'gedung-a')!.generation.items), aItemsBefore, 'item A utuh');
    eq(sectionTotal(d, 'gedung-a')!.totals.estimatedTotal, aTotalBefore, 'subtotal A utuh');
    eq(d.buildings!.find((x) => x.id === 'gedung-b')!.floors, 4, 'model B 4 lantai');
    eq(d.buildings!.find((x) => x.id === 'gedung-a')!.floors, 3, 'model A tetap 3 lantai');
  });

  /* ============ 5B-03 — update satu gedung tidak menimpa lain ============ */
  await check('5B-03 update satu gedung tidak menimpa gedung lain (spek/dimensi/QTO)', () => {
    const d = buildMulti();
    const bModelBefore = JSON.stringify(d.buildings!.find((x) => x.id === 'gedung-b'));
    const bPartBefore = JSON.stringify(partFor(d, 'gedung-b'));
    const bQtoBefore = JSON.stringify(mbr.checkBuildingQto(d, d.buildings!.find((x) => x.id === 'gedung-b')!));
    assert(rab.looksLikeUniversalRevision('gedung A 14 x 9 m'), 'revisi dimensi beralamat gedung dikenali router');
    const rev = rab.reviseUniversalDraft(d, 'gedung A 14 x 9 m');
    assert(rev && rev.ok && rev.changed, `revisi dimensi A harus berhasil (${JSON.stringify(rev)})`);
    eq(partFor(d, 'gedung-a')!.evaluatedParams.building_area, 126, 'A menjadi 126 m²');
    eq(d.buildings!.find((x) => x.id === 'gedung-a')!.buildingAreaM2, 126, 'model A 126 m²');
    eq(JSON.stringify(d.buildings!.find((x) => x.id === 'gedung-b')), bModelBefore, 'model B utuh');
    eq(JSON.stringify(partFor(d, 'gedung-b')), bPartBefore, 'part B utuh');
    eq(
      JSON.stringify(mbr.checkBuildingQto(d, d.buildings!.find((x) => x.id === 'gedung-b')!)),
      bQtoBefore,
      'QTO B utuh'
    );
  });

  /* ============ 5B-04 — shared work dihitung tepat sekali ============ */
  await check('5B-04 shared work dihitung tepat sekali', () => {
    const d = buildMulti();
    const shared = d.parts.filter((p) => p.sectionKind === 'shared-works');
    eq(shared.length, 1, 'satu part shared works (jalan)');
    eq(shared[0].scope.id, 'jalan', 'shared = jalan');
    eq(shared[0].evaluatedParams.road_length, 50, 'jalan 50 m');
    const sharedSection = sectionTotal(d, 'shared-works')!;
    eq(sharedSection.itemCount, shared[0].generation.items.length, 'item shared = item part jalan');
    // Dua shared scope: masing-masing tetap sekali (panjang pagar ikut
    // lengthM proyek — batasan yang didokumentasikan, bukan ditebak).
    const d2 = buildMulti(
      'buatkan RAB Gedung A 3 lantai 15 x 10 m + Gedung B 2 lantai 12 x 8 m, plus jalan akses sepanjang 50 m dan pagar'
    );
    const shared2 = d2.parts.filter((p) => p.sectionKind === 'shared-works');
    eq(shared2.map((p) => p.scope.id).sort(), ['jalan', 'lanskap'], 'jalan + pagar, masing-masing sekali');
    eq(d2.parts.filter((p) => p.sectionKind === 'building').length, 2, 'tetap 2 part gedung');
  });

  /* ============ 5B-05 — rekonsiliasi total Rp0 ============ */
  await check('5B-05 total terkonsolidasi direkonsiliasi (selisih Rp0)', () => {
    const d = buildMulti();
    const rec = rab.reconcileMultiBuildingTotals(d);
    assert(rec.balanced, `rekonsiliasi harus seimbang (diff Rp${rec.diffRp})`);
    eq(rec.diffRp, 0, 'selisih Rp0');
    eq(rec.sumOfSections, rec.projectTotal.estimatedTotal, 'Σ seksi = total proyek');
    eq(rec.projectTotal.estimatedTotal, 924102500, 'total proyek contoh kanonis');
    // Tetap seimbang sesudah revisi satu gedung.
    rab.reviseUniversalDraft(d, 'gedung B jadi 4 lantai');
    const rec2 = rab.reconcileMultiBuildingTotals(d);
    assert(rec2.balanced, `rekonsiliasi pasca-revisi harus seimbang (diff Rp${rec2.diffRp})`);
    eq(rec2.diffRp, 0, 'selisih Rp0 pasca-revisi');
    assert(rec2.projectTotal.estimatedTotal > rec.projectTotal.estimatedTotal, 'total naik sesudah B→4 lantai');
  });

  /* ============ 5B-06 — golden single-building ============ */
  await check('5B-06 single-building: output identik dengan sebelum gate (golden)', () => {
    const goldenPath = `${process.cwd()}/../your_files/EZRAB-PHASE5-WORKFLOW-INTEGRATION-2026-11-12/repro/golden-single-building.json`;
    const golden = JSON.parse(readFileSync(goldenPath, 'utf-8')) as Record<string, any>;
    const stripDraft = (draft: Draft) => ({
      title: draft.title,
      spec: draft.spec,
      parts: draft.parts.map((p) => ({
        scope: p.scope.id,
        templateId: p.template.id,
        templateName: p.template.name,
        evaluatedParams: p.evaluatedParams,
        items: p.generation.items.map((it) => ({
          description: it.description,
          volume: it.volume,
          unit: it.unit,
          unitPrice: it.unitPrice ?? null,
          priceSourceKind: it.priceSourceKind ?? null,
          priceStatus: it.priceStatus ?? null,
        })),
      })),
      assumptions: draft.assumptions,
      warnings: draft.warnings,
      changes: draft.changes,
      version: draft.version,
      chainValidation: draft.chainValidation ?? null,
      ambiguousPicks: draft.ambiguousPicks ?? null,
      totals: rab.computeTotals(draft),
    });
    let buildCases = 0;
    for (const [key, g] of Object.entries(golden)) {
      if (key.startsWith('REVISE:')) continue;
      buildCases++;
      const res = rab.buildUniversalDraft(key);
      eq(res.kind, g.kind, `${key}: kind`);
      if (res.kind !== 'draft') {
        eq((res as { reason: string }).reason, g.reason, `${key}: reason needs-spec`);
        eq((res as { missing?: string[] }).missing ?? null, g.missing ?? null, `${key}: missing`);
        continue;
      }
      const now = stripDraft(res.draft);
      const gold = { ...g.draft };
      delete gold.buildings;
      delete gold.message;
      eq(now, gold, `${key}: draft (tanpa buildings/message)`);
      // Pesan identik modulo baris ringkasan per-bangunan (pengayaan
      // parser Gate 2 yang disengaja — lihat laporan §4/§9).
      eq(
        stripBuildingLines(rab.formatUniversalDraftMessage(res.draft)),
        stripBuildingLines(g.draft.message),
        `${key}: pesan modulo baris gedung`
      );
      // Pengayaan model gedung harus KONSISTEN dengan spek (bukan angka
      // karangan): dimensi terisi hanya bila sama dengan spek proyek.
      // Konvensi sisi: model menyimpan urutan tulis, spek memakai
      // konvensi rabNeeds (buildingLengthM = angka kedua) — bandingkan
      // DITUKAR.
      const nb = (res.draft.buildings ?? []) as any[];
      for (const b of nb) {
        if (b.lengthM != null) eq(b.lengthM, res.draft.spec.buildingWidthM, `${key}: lengthM model = buildingWidthM spek`);
        if (b.widthM != null) eq(b.widthM, res.draft.spec.buildingLengthM, `${key}: widthM model = buildingLengthM spek`);
        if (b.buildingAreaM2 != null) eq(b.buildingAreaM2, res.draft.spec.areaM2, `${key}: area konsisten`);
      }
      if (g.draft.buildings == null) {
        // Golden tanpa model gedung — tidak ada perbandingan medan lain.
      } else {
        eq(nb.length, g.draft.buildings.length, `${key}: jumlah model gedung`);
        for (let i = 0; i < nb.length; i++) {
          const { spanText: _s, lengthM: _l, widthM: _w, buildingAreaM2: _a, ...restNew } = nb[i];
          const { spanText: _s2, lengthM: _l2, widthM: _w2, buildingAreaM2: _a2, ...restGold } = g.draft.buildings[i];
          eq(restNew, restGold, `${key}: model gedung ${i} (tanpa dims/span)`);
        }
      }
      // Part single-building TIDAK membawa medan seksi baru.
      for (const p of res.draft.parts) {
        assert(p.buildingId === undefined, `${key}: part single tanpa buildingId`);
        assert(p.sectionKind === undefined, `${key}: part single tanpa sectionKind`);
        assert(p.spec === undefined, `${key}: part single tanpa spec`);
      }
    }
    assert(buildCases === 10, `kasus build golden = 10 (dapat ${buildCases})`);
    // Dua kasus revisi golden.
    for (const [key, g] of Object.entries(golden)) {
      if (!key.startsWith('REVISE:')) continue;
      const m = key.match(/^REVISE: (.+) -> (.+)$/)!;
      const res = rab.buildUniversalDraft(m[1]);
      assert(res.kind === 'draft', `${key}: build awal`);
      const rev = rab.reviseUniversalDraft((res as { draft: Draft }).draft, m[2]);
      assert(rev, `${key}: revisi dikenali`);
      eq(rev!.ok, g.ok, `${key}: ok`);
      eq(rev!.changed, g.changed, `${key}: changed`);
      eq(rab.computeTotals((res as { draft: Draft }).draft), g.totals, `${key}: totals`);
      eq(stripBuildingLines(rev!.message), stripBuildingLines(g.message), `${key}: pesan modulo baris gedung`);
    }
  });

  /* ============ 5B-07 — gedung tanpa dimensi ditandai eksplisit ============ */
  await check('5B-07 gedung dengan dimensi hilang ditandai eksplisit, tanpa kuantitas karangan', () => {
    // (a) Semua gedung tanpa basis → needs-spec, tanpa draft/kuantitas.
    const res = rab.buildUniversalDraft('buatkan RAB 2 gedung');
    eq(res.kind, 'needs-spec', '"2 gedung" tanpa ukuran → needs-spec');
    const missing = (res as { missing?: string[] }).missing ?? [];
    assert(missing.length === 2, `missing menyebut kedua gedung (${JSON.stringify(missing)})`);
    assert(missing.every((m) => /lantai atau dimensi/.test(m)), 'missing menyebut lantai/dimensi');
    // (b) Campuran: A dihitung, B ditandai hilang (via opts.buildings —
    //     jalur registry untuk konteks multi-giliran).
    const aModel = mb.parseBuildingsFromText('Gedung A 3 lantai 15 x 10 m')[0];
    const bFlagged = mb.emptyBuilding('gedung-b', 'Gedung B');
    const res2 = rab.buildUniversalDraft('buatkan RAB Gedung A 3 lantai 15 x 10 m', undefined, {
      buildings: [aModel, bFlagged],
    });
    assert(res2.kind === 'draft', 'draft campuran harus tersusun');
    const d2 = (res2 as { draft: Draft }).draft;
    assert(partFor(d2, 'gedung-a'), 'A punya part');
    assert(!partFor(d2, 'gedung-b'), 'B TIDAK punya part (tanpa kuantitas karangan)');
    assert(!rab.effectiveItems(d2).some((it) => it.__buildingId === 'gedung-b'), 'tidak ada item B');
    assert(d2.warnings.some((w) => w.includes('Gedung B') && /belum dihitung/.test(w)), 'peringatan B belum dihitung');
    const msg = rab.formatUniversalDraftMessage(d2);
    assert(msg.includes('BELUM DIHITUNG'), 'pesan menandai B BELUM DIHITUNG');
    assert(rab.reconcileMultiBuildingTotals(d2).balanced, 'rekonsiliasi tetap seimbang (B = 0)');
  });

  /* ============ 5B-08 — kompatibel-balik ============ */
  await check('5B-08 migrasi/kompatibel-balik: record & snapshot lama tetap terbaca', () => {
    eq(dp.DRAFT_SCHEMA_VERSION, 1, 'DRAFT_SCHEMA_VERSION tetap 1 (tanpa bump)');
    storage.clear();
    const d = buildMulti();
    const pid = 'proj-5b-08';
    const saved = dp.saveDraft({ draft: d, projectId: pid });
    assert(saved.ok, `saveDraft ok (${JSON.stringify(saved)})`);
    // (a) Record lama TANPA field buildings → tetap terbaca.
    const raw = JSON.parse(storage.getItem(dp.AI_DRAFTS_STORAGE_KEY)!);
    delete raw.data[pid].buildings;
    storage.setItem(dp.AI_DRAFTS_STORAGE_KEY, JSON.stringify(raw));
    const loaded = dp.loadDraft(pid);
    assert(loaded.ok, `loadDraft record lama ok (${JSON.stringify(loaded)})`);
    assert((loaded as { ok: true; draft: Draft }).draft.buildings == null, 'record lama: buildings null');
    eq(
      rab.effectiveItems((loaded as { ok: true; draft: Draft }).draft).length,
      rab.effectiveItems(d).length,
      'record lama: item utuh'
    );
    // (b) Field buildings RUSAK → entri tak valid dibuang, draft tetap terbaca.
    const raw2 = JSON.parse(storage.getItem(dp.AI_DRAFTS_STORAGE_KEY)!);
    raw2.data[pid].buildings = [{ label: 'tanpa id' }, 'bukan-objek', { id: 'gedung-a', label: 'Gedung A' }];
    storage.setItem(dp.AI_DRAFTS_STORAGE_KEY, JSON.stringify(raw2));
    const loaded2 = dp.loadDraft(pid);
    assert(loaded2.ok, 'loadDraft buildings rusak tetap ok');
    eq(
      ((loaded2 as { ok: true; draft: Draft }).draft.buildings ?? []).map((b) => b.id),
      ['gedung-a'],
      'hanya entri ber-id yang dipertahankan'
    );
    const raw3 = JSON.parse(storage.getItem(dp.AI_DRAFTS_STORAGE_KEY)!);
    raw3.data[pid].buildings = 'bukan-array';
    storage.setItem(dp.AI_DRAFTS_STORAGE_KEY, JSON.stringify(raw3));
    const loaded3 = dp.loadDraft(pid);
    assert(loaded3.ok && (loaded3 as { ok: true; draft: Draft }).draft.buildings == null, 'buildings non-array → null');
    // (c) Skema versi tak dikenal tetap fail-closed.
    const raw4 = JSON.parse(storage.getItem(dp.AI_DRAFTS_STORAGE_KEY)!);
    raw4.data[pid].schemaVersion = 2;
    storage.setItem(dp.AI_DRAFTS_STORAGE_KEY, JSON.stringify(raw4));
    const loaded4 = dp.loadDraft(pid);
    assert(!loaded4.ok && (loaded4 as { ok: false; error: string }).error === 'DRAFT_SCHEMA_UNSUPPORTED', 'v2 ditolak fail-closed');
    storage.clear();
  });

  /* ============ 5B-09 — provenans per gedung ============ */
  await check('5B-09 provenance per gedung terjaga', () => {
    const d = buildMulti();
    const ma = d.buildings!.find((x) => x.id === 'gedung-a')!;
    const mbb = d.buildings!.find((x) => x.id === 'gedung-b')!;
    assert(ma.sourceText && ma.sourceText.length > 0, 'A punya sourceText');
    assert(mbb.sourceText && mbb.sourceText.length > 0, 'B punya sourceText');
    assert(ma.spanText?.includes('15 x 10'), `span A menyebut 15 x 10 (${ma.spanText})`);
    assert(mbb.spanText?.includes('12 x 8'), `span B menyebut 12 x 8 (${mbb.spanText})`);
    eq(partFor(d, 'gedung-a')!.spec?.rawText, ma.spanText, 'part A.spec.rawText = span A');
    eq(partFor(d, 'gedung-b')!.spec?.rawText, mbb.spanText, 'part B.spec.rawText = span B');
    assert(!partFor(d, 'gedung-a')!.spec?.rawText?.includes('12 x 8'), 'span A tidak tercemar dimensi B');
  });

  /* ============ 5B-10 — QTO per gedung memakai dimensi sendiri ============ */
  await check('5B-10 QTO per gedung memakai dimensi gedung itu sendiri', () => {
    const d = buildMulti();
    const ma = d.buildings!.find((x) => x.id === 'gedung-a')!;
    const mbb = d.buildings!.find((x) => x.id === 'gedung-b')!;
    const qA = mbr.checkBuildingQto(d, ma);
    const qB = mbr.checkBuildingQto(d, mbb);
    assert(qA.length > 0 && qB.length > 0, `QTO kedua gedung non-kosong (A=${qA.length}, B=${qB.length})`);
    assert(JSON.stringify(qA) !== JSON.stringify(qB), 'hasil QTO A ≠ B (dimensi berbeda)');
    const sumA = mbr.summarizeQtoChecks(qA);
    const sumB = mbr.summarizeQtoChecks(qB);
    eq(sumA.total, qA.length, 'ringkasan A konsisten');
    eq(sumB.total, qB.length, 'ringkasan B konsisten');
    // Revisi A mengubah QTO A saja; QTO B byte-identik.
    const qBBefore = JSON.stringify(qB);
    rab.reviseUniversalDraft(d, 'gedung A 14 x 9 m');
    const qBAfter = JSON.stringify(mbr.checkBuildingQto(d, d.buildings!.find((x) => x.id === 'gedung-b')!));
    eq(qBAfter, qBBefore, 'QTO B utuh sesudah revisi A');
    const qAAfter = mbr.checkBuildingQto(d, d.buildings!.find((x) => x.id === 'gedung-a')!);
    assert(JSON.stringify(qAAfter) !== JSON.stringify(qA), 'QTO A berubah sesudah revisi A');
  });

  /* ============ 5B-11 — revisi tanpa alamat gedung ditolak ============ */
  await check('5B-11 revisi ukuran tanpa alamat gedung ditolak sebagai ambigu', () => {
    const d = buildMulti();
    const vBefore = d.version;
    const partsBefore = JSON.stringify(d.parts);
    const rev = rab.reviseUniversalDraft(d, 'ubah jumlah lantai menjadi 5 lantai');
    assert(rev && !rev.ok && !rev.changed, `revisi ambigu harus ditolak (${JSON.stringify(rev)})`);
    assert(/sebutkan gedungnya/i.test(rev.message), `pesan meminta klarifikasi gedung (${rev.message.slice(0, 200)})`);
    eq(d.version, vBefore, 'versi tidak naik');
    eq(JSON.stringify(d.parts), partsBefore, 'part tidak berubah');
    const rev2 = rab.reviseUniversalDraft(d, 'ubah luas menjadi 200 m2');
    assert(rev2 && !rev2.ok && !rev2.changed, 'revisi luas ambigu juga ditolak');
  });

  /* ============ 5B-12 — hapus/harga-manual mengenai gedung yang benar ============ */
  await check('5B-12 hapus & harga manual mengenai gedung yang benar', () => {
    // Hapus: nomor item pertama Gedung B (template sama dengan A —
    // tanpa penanda seksi, hapus akan mengenai A).
    const d = buildMulti();
    const items = rab.effectiveItems(d);
    const bIdx = items.findIndex((it) => it.__buildingId === 'gedung-b');
    assert(bIdx >= 0, 'ada item Gedung B');
    const targetDesc = items[bIdx].description;
    const rev = rab.reviseUniversalDraft(d, `hapus item ${bIdx + 1}`);
    assert(rev && rev.ok && rev.changed, `hapus item B harus berhasil (${JSON.stringify(rev)})`);
    eq(partFor(d, 'gedung-b')!.removedKeys.length, 1, 'B: 1 kunci hapus');
    eq(partFor(d, 'gedung-a')!.removedKeys.length, 0, 'A: 0 kunci hapus');
    assert(
      rab.effectiveItems(d).some((it) => it.__buildingId === 'gedung-a' && it.description === targetDesc),
      'item berdeskripsi sama di A tetap ada'
    );
    assert(
      !rab.effectiveItems(d).some((it) => it.__buildingId === 'gedung-b' && it.description === targetDesc),
      'item target di B hilang'
    );
    // Harga manual: nomor item pertama Gedung B pada draft segar.
    const d2 = buildMulti();
    const items2 = rab.effectiveItems(d2);
    const bIdx2 = items2.findIndex((it) => it.__buildingId === 'gedung-b');
    const rev2 = rab.reviseUniversalDraft(d2, `gunakan harga manual Rp 500.000 untuk item ${bIdx2 + 1}`);
    assert(rev2 && rev2.ok && rev2.changed, `harga manual B harus berhasil (${JSON.stringify(rev2)})`);
    eq(Object.keys(partFor(d2, 'gedung-b')!.manualPrices).length, 1, 'B: 1 harga manual');
    eq(Object.keys(partFor(d2, 'gedung-a')!.manualPrices).length, 0, 'A: 0 harga manual');
  });

  /* ============ 5B-13 — revisi fungsi memilih ulang template satu gedung ============ */
  await check('5B-13 revisi fungsi memilih ulang template gedung itu saja', () => {
    const d = buildMulti();
    const aTemplateBefore = partFor(d, 'gedung-a')!.template.id;
    const aParamsBefore = JSON.stringify(partFor(d, 'gedung-a')!.evaluatedParams);
    const bTemplateBefore = partFor(d, 'gedung-b')!.template.id;
    const rev = rab.reviseUniversalDraft(d, 'gedung B jadi gudang');
    assert(rev && rev.ok && rev.changed, `revisi fungsi B harus berhasil (${JSON.stringify(rev)})`);
    const bPart = partFor(d, 'gedung-b')!;
    assert(bPart.template.id !== bTemplateBefore, `template B berganti (${bTemplateBefore} → ${bPart.template.id})`);
    assert(
      bPart.template.name.toLowerCase().includes('gudang'),
      `template baru B adalah gudang (${bPart.template.name})`
    );
    eq(partFor(d, 'gedung-a')!.template.id, aTemplateBefore, 'template A utuh');
    eq(JSON.stringify(partFor(d, 'gedung-a')!.evaluatedParams), aParamsBefore, 'params A utuh');
    assert(
      d.buildings!.find((x) => x.id === 'gedung-b')!.label.includes('gudang'),
      'label B mencatat fungsi baru'
    );
    assert(rab.reconcileMultiBuildingTotals(d).balanced, 'rekonsiliasi tetap seimbang');
  });

  /* ============ 5B-14 — round-trip persistensi ============ */
  await check('5B-14 round-trip persistensi: struktur multi-gedung selamat', () => {
    storage.clear();
    const d = buildMulti();
    rab.reviseUniversalDraft(d, 'gedung B jadi 4 lantai');
    const pid = 'proj-5b-14';
    const saved = dp.saveDraft({ draft: d, projectId: pid });
    assert(saved.ok, `saveDraft ok (${JSON.stringify(saved)})`);
    // Simulasi reload: bersihkan singleton in-memory saja.
    rab.setLastUniversalDraft(null);
    const loaded = dp.loadDraft(pid);
    assert(loaded.ok, `loadDraft ok (${JSON.stringify(loaded)})`);
    const rd = (loaded as { ok: true; draft: Draft }).draft;
    eq(rd.buildings, d.buildings, 'buildings utuh');
    eq(
      rd.parts.map((p) => [p.buildingId ?? null, p.sectionKind ?? null, p.spec?.rawText ?? null]),
      d.parts.map((p) => [p.buildingId ?? null, p.sectionKind ?? null, p.spec?.rawText ?? null]),
      'buildingId/sectionKind/part.spec utuh'
    );
    eq(rab.effectiveItems(rd), rab.effectiveItems(d), 'effectiveItems utuh');
    eq(rab.computeTotals(rd), rab.computeTotals(d), 'totals utuh');
    eq(rab.reconcileMultiBuildingTotals(rd).diffRp, 0, 'rekonsiliasi utuh pasca-restore');
    // Simpan ulang isi yang sama → didedup (sidik mencakup buildings).
    const saved2 = dp.saveDraft({ draft: rd, projectId: pid });
    assert(saved2.ok && saved2.deduplicated, `save ulang didedup (${JSON.stringify(saved2)})`);
    // Revisi pasca-restore tetap berfungsi & hanya menyentuh B.
    const aBefore = JSON.stringify(partFor(rd, 'gedung-a'));
    const rev = rab.reviseUniversalDraft(rd, 'gedung B jadi 5 lantai');
    assert(rev && rev.ok, 'revisi pasca-restore berhasil');
    eq(JSON.stringify(partFor(rd, 'gedung-a')), aBefore, 'A utuh pasca-revisi-restore');
    storage.clear();
  });

  /* ============ 5B-15 — parser: dims-first + last-wins + count ============ */
  await check('5B-15 parser: dims-first, revisi last-wins, hitungan telanjang', () => {
    const b1 = mb.parseBuildingsFromText('gedung A 15 x 10 m 3 lantai dan gedung B 12 x 8 m 2 lantai');
    eq(b1.length, 2, 'dims-first: 2 gedung');
    eq([b1[0].floors, b1[0].buildingAreaM2], [3, 150], 'dims-first A');
    eq([b1[1].floors, b1[1].buildingAreaM2], [2, 96], 'dims-first B');
    const b2 = mb.parseBuildingsFromText(
      'Gedung A 3 lantai 15 x 10 m + Gedung B 2 lantai 12 x 8 m. Gedung B jadi 4 lantai'
    );
    eq(b2.find((x) => x.id === 'gedung-b')!.floors, 4, 'last-wins: B 4 lantai');
    eq(b2.find((x) => x.id === 'gedung-a')!.floors, 3, 'last-wins: A tetap 3');
    const b3 = mb.parseBuildingsFromText('buatkan RAB 2 gedung');
    eq(b3.length, 2, 'count telanjang: 2 gedung generik');
    assert(b3.every((x) => x.floors == null && x.buildingAreaM2 == null), 'count: tanpa basis');
    const b4 = mb.parseBuildingsFromText(
      'Gedung A 3 lantai 15 x 10 m di lahan 20 x 30 m + Gedung B 2 lantai 12 x 8 m'
    );
    eq(b4.find((x) => x.id === 'gedung-a')!.buildingAreaM2, 150, 'dimensi lahan tidak diatribusikan ke A');
    eq(b4.find((x) => x.id === 'gedung-b')!.buildingAreaM2, 96, 'dimensi lahan tidak diatribusikan ke B');
    // Hitungan + nama dalam satu teks: bernama mengisi slot hitungan.
    const b5 = mb.parseBuildingsFromText('buatkan RAB 2 gedung, Gedung A 3 lantai 15 x 10 m');
    eq(b5.map((x) => x.id), ['gedung-a', 'bangunan-1'], 'hitungan+named: A + 1 generik');
    const b6 = mb.parseBuildingsFromText('3 gedung: Gedung A 3 lantai 15 x 10 m dan Gedung B 2 lantai 12 x 8 m');
    eq(b6.map((x) => x.id), ['gedung-a', 'gedung-b', 'bangunan-1'], 'hitungan 3 + 2 bernama = 3 total');
    const b7 = mb.parseBuildingsFromText('2 gedung: Gedung A 3 lantai, Gedung B 2 lantai, Gedung C 1 lantai');
    eq(b7.length, 3, 'bernama melebihi hitungan: hitungan terpenuhi (3)');
    // Multi-giliran via jalur intake nyata: hitungan lalu nama (dan sebaliknya).
    const ctx1 = intake.extractUniversalContext('Saya mau bangun 2 gedung');
    eq(ctx1.buildings.map((x) => x.id), ['bangunan-1', 'bangunan-2'], 'giliran 1: 2 generik');
    const ctx2 = intake.extractUniversalContext(
      'Gedung A 3 lantai 15 x 10 m dan Gedung B 2 lantai 12 x 8 m',
      ctx1
    );
    eq(ctx2.buildings.map((x) => x.id), ['gedung-a', 'gedung-b'], 'giliran 2: nama mengisi slot (tanpa hantu)');
    const ctx1b = intake.extractUniversalContext('Gedung A 3 lantai 15 x 10 m');
    const ctx2b = intake.extractUniversalContext('2 gedung', ctx1b);
    eq(ctx2b.buildings.map((x) => x.id), ['gedung-a', 'bangunan-1'], 'hitungan sesudah nama: total 2');
    const ctx3 = intake.extractUniversalContext('2 gedung', ctx2);
    eq(ctx3.buildings.map((x) => x.id), ['gedung-a', 'gedung-b'], 'hitungan ulang: no-op idempotent');
  });

  /* ============ 5B-16 — validasi rantai per gedung + shared ============ */
  await check('5B-16 validasi rantai spek berlaku per gedung + shared works', () => {
    const d = buildMulti();
    const v = chain.validateDraftChain(d, []);
    eq(v.itemLinks.length, rab.effectiveItems(d).length, 'itemLinks mencakup semua item efektif');
    const basis = chain.computeVolumeBasis(d, []);
    // Gabung basis ↔ item efektif secara POSISIONAL: kedua fungsi
    // mengiterasi part→item dalam urutan yang sama (id tidak dapat
    // dipakai — effectiveItems menulis ulang id menjadi
    // `templateId::id`, perilaku lama yang bukan urusan Gate 2).
    const items = rab.effectiveItems(d);
    eq(basis.length, items.length, 'basis mencakup semua item efektif');
    let aUserDim = 0;
    let bUserDim = 0;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const link = basis[i];
      assert(link.description === it.description, `basis[${i}] sejajar item ${it.description}`);
      if (link.basis === 'USER_DIMENSION') {
        if (it.__buildingId === 'gedung-a') {
          aUserDim++;
          assert(!link.basisDetail.includes('building_area=96'), 'basis A tidak menyebut 96');
        }
        if (it.__buildingId === 'gedung-b') {
          bUserDim++;
          assert(!link.basisDetail.includes('building_area=150'), 'basis B tidak menyebut 150');
        }
      }
    }
    assert(aUserDim > 0, 'ada item A ber-basis USER_DIMENSION');
    assert(bUserDim > 0, 'ada item B ber-basis USER_DIMENSION');
    assert(
      basis.some((l) => l.basisDetail.includes('building_area=150')),
      'basis A menyebut building_area=150'
    );
    assert(
      basis.some((l) => l.basisDetail.includes('building_area=96')),
      'basis B menyebut building_area=96'
    );
    // Item shared works ikut divalidasi (bukan hanya gedung).
    const sharedIdx = items.findIndex((it) => it.__sectionKind === 'shared-works');
    assert(sharedIdx >= 0 && basis[sharedIdx], 'item shared punya basis');
  });

  /* ============ 5B-17 — payload push berlabel seksi + dedup ============ */
  await check('5B-17 payload push berlabel seksi; dedup mempertahankan kedua gedung', () => {
    const d = buildMulti();
    const payload = rab.buildPushPayload(d);
    eq(payload.length, rab.effectiveItems(d).length, 'payload = semua item efektif');
    const items = rab.effectiveItems(d);
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.__buildingId === 'gedung-a') assert(payload[i].description.includes('[Gedung A]'), `item A berlabel (${payload[i].description})`);
      if (it.__buildingId === 'gedung-b') assert(payload[i].description.includes('[Gedung B]'), `item B berlabel (${payload[i].description})`);
      if (it.__sectionKind === 'shared-works') assert(payload[i].description.includes('[Pekerjaan Bersama]'), `item shared berlabel (${payload[i].description})`);
    }
    const ded = rab.dedupePushPayload(payload, []);
    eq(ded.newItems.length, payload.length, 'dedup internal tidak membuang item gedung kedua');
    eq(ded.dupCount, 0, '0 duplikat internal');
    // Single-building: deskripsi TIDAK berlabel seksi.
    const s = rab.buildUniversalDraft('buatkan RAB gudang 12 x 25 m');
    assert(s.kind === 'draft', 'single gudang');
    const sp = rab.buildPushPayload((s as { draft: Draft }).draft);
    assert(sp.every((p) => !/\[Gedung|\[Pekerjaan Bersama\]/.test(p.description)), 'payload single tanpa label seksi');
  });

  /* ============ 5B-18 — brief menampilkan kedua gedung ============ */
  await check('5B-18 brief menampilkan kedua gedung terpisah', () => {
    const ctx = intake.extractUniversalContext(MULTI_TEXT);
    const brief = intake.buildUniversalBriefLines(ctx).join('\n');
    assert(brief.includes('**Bangunan (per bangunan)**'), 'brief punya seksi Bangunan');
    assert(brief.includes('Gedung A: 3 lantai; 15 m × 10 m; luas 150 m²'), `brief menyebut A (${brief.slice(0, 600)})`);
    assert(brief.includes('Gedung B: 2 lantai; 12 m × 8 m; luas 96 m²'), 'brief menyebut B');
    // Verifikasi visual E2E: tanpa bullet ganda / header duplikat.
    assert(!brief.includes('• • '), 'brief tanpa bullet ganda');
    eq(brief.split('Bangunan (per bangunan').length - 1, 1, 'header Bangunan tepat sekali');
  });

  /* ============ 5B-19 — revisi shared scope: hanya part non-gedung ============ */
  await check('5B-19 revisi shared scope meregenerasi hanya part non-gedung', () => {
    const d = buildMulti();
    const aBefore = JSON.stringify(partFor(d, 'gedung-a'));
    const bBefore = JSON.stringify(partFor(d, 'gedung-b'));
    const rev = rab.reviseUniversalDraft(d, 'panjang menjadi 100 m untuk jalan akses');
    assert(rev && rev.ok && rev.changed, `revisi jalan harus berhasil (${JSON.stringify(rev)})`);
    const road = d.parts.find((p) => p.scope.id === 'jalan')!;
    eq(road.evaluatedParams.road_length, 100, 'jalan menjadi 100 m');
    eq(JSON.stringify(partFor(d, 'gedung-a')), aBefore, 'part A utuh');
    eq(JSON.stringify(partFor(d, 'gedung-b')), bBefore, 'part B utuh');
    assert(rab.reconcileMultiBuildingTotals(d).balanced, 'rekonsiliasi tetap seimbang');
  });

  /* ============ 5B-20 — melengkapi gedung yang ditandai hilang ============ */
  await check('5B-20 melengkapi gedung yang ditandai hilang membangun part-nya', () => {
    const aModel = mb.parseBuildingsFromText('Gedung A 3 lantai 15 x 10 m')[0];
    const bFlagged = mb.emptyBuilding('gedung-b', 'Gedung B');
    const res = rab.buildUniversalDraft('buatkan RAB Gedung A 3 lantai 15 x 10 m', undefined, {
      buildings: [aModel, bFlagged],
    });
    assert(res.kind === 'draft', 'draft campuran tersusun');
    const d = (res as { draft: Draft }).draft;
    assert(!partFor(d, 'gedung-b'), 'B belum punya part');
    const aBefore = JSON.stringify(partFor(d, 'gedung-a'));
    const rev = rab.reviseUniversalDraft(d, 'gedung B jadi 3 lantai');
    assert(rev && rev.ok && rev.changed, `revisi pelengkap B harus berhasil (${JSON.stringify(rev)})`);
    const bPart = partFor(d, 'gedung-b');
    assert(bPart, 'B kini punya part');
    eq(bPart!.evaluatedParams.num_floors, 3, 'B 3 lantai');
    eq(bPart!.sectionKind, 'building', 'part B berseksi building');
    eq(JSON.stringify(partFor(d, 'gedung-a')), aBefore, 'part A utuh');
    assert(rab.reconcileMultiBuildingTotals(d).balanced, 'rekonsiliasi seimbang sesudah B dilengkapi');
    assert(!rab.formatUniversalDraftMessage(d).includes('BELUM DIHITUNG'), 'tidak ada lagi BELUM DIHITUNG');
  });

  console.log(`\nchatPhase5MultiBuilding.test: ${passed} PASS, ${failed} FAIL`);
  if (failures.length) {
    console.log(`Gagal: ${failures.join(' | ')}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

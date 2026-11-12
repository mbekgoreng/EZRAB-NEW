/**
 * chatPhase5Revision.test.ts — GATE 3 (5C): Post-Generation Revision
 * Immutable (Phase 5 Workflow Integration, direktif owner 2026-11-12
 * 11:45 WIB §5 + §10 Gate 3).
 *
 * Gaya plain-tsx: `npx --yes tsx src/test/chatPhase5Revision.test.ts`
 *
 * Setiap tes memakai JALUR NYATA (parser + mesin template + mesin revisi
 * + pratinjau + aktivasi + persistensi), bukan mock jalur. Simulasi
 * "reload" = bersihkan singleton in-memory TANPA menyentuh storage
 * (pola Gate 1).
 *
 * Contoh kanonis multi-gedung (dipakai suite + E2E, sama dengan Gate 2):
 *   Gedung A 3 lantai 15 x 10 m (= 150 m²) + Gedung B 2 lantai
 *   12 x 8 m (= 96 m²) + jalan akses sepanjang 50 m (shared works).
 * Total proyek: Rp 924.102.500.
 *
 * Klasifikasi per ID: VERIFIED PASS / VERIFIED FAIL / PARTIAL /
 * BLOCKED / NOT RUN (lihat laporan gate3-revision-immutable.md).
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

/** Stringify kanonis (kunci terurut, sesudah round-trip JSON agar kunci
 *  `undefined` yang hilang di storage tidak menimbulkan palsu-negatif).
 *  Dipakai untuk klaim byte-identik antar versi. */
const canon = (v: unknown): string => {
  const roundTripped = JSON.parse(JSON.stringify(v)) as unknown;
  const walk = (x: unknown): string => {
    if (x === null || typeof x !== 'object') return JSON.stringify(x) ?? 'null';
    if (Array.isArray(x)) return `[${x.map(walk).join(',')}]`;
    const o = x as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${walk(o[k])}`)
      .join(',')}}`;
  };
  return walk(roundTripped);
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

const MULTI_TEXT =
  'buatkan RAB Gedung A 3 lantai 15 x 10 m + Gedung B 2 lantai 12 x 8 m, plus jalan akses sepanjang 50 m';
const MULTI_BUDGET_TEXT = `${MULTI_TEXT}, budget Rp 900 juta`;

function storageSnapshot(): string {
  return JSON.stringify([...storage.raw.entries()].sort((a, b) => a[0].localeCompare(b[0])));
}

async function main(): Promise<void> {
  console.log('chatPhase5Revision.test (GATE 3 / 5C)');
  const rab = await import('../ai-tools/ezrab-ai/universalRab');
  const mbr = await import('../ai-tools/ezrab-ai/multiBuildingRab');
  const dp = await import('../ai-tools/ezrab-ai/draftPersistence');
  const rev = await import('../ai-tools/ezrab-ai/draftRevision');

  type Draft = ReturnType<typeof rab.buildUniversalDraft> extends { kind: 'draft'; draft: infer D }
    ? D
    : never;

  let pidCounter = 0;
  const nextPid = () => `PRJ-5C-${++pidCounter}`;

  const buildMulti = (text: string = MULTI_TEXT): Draft => {
    const res = rab.buildUniversalDraft(text);
    assert(res.kind === 'draft', `buildMulti: kind=${res.kind} (${JSON.stringify(res).slice(0, 300)})`);
    return (res as { kind: 'draft'; draft: Draft }).draft;
  };
  /** Draft multi-gedung yang SUDAH tersimpan (syarat aktivasi). */
  const buildSavedMulti = (text: string = MULTI_TEXT): { pid: string; draft: Draft } => {
    const pid = nextPid();
    const draft = buildMulti(text);
    rab.setLastUniversalDraft(draft, pid);
    const saved = dp.saveDraft({ draft, projectId: pid });
    assert(saved.ok, `saveDraft gagal: ${JSON.stringify(saved)}`);
    return { pid, draft };
  };
  const previewOf = (draft: Draft, pid: string, text: string) => {
    const out = rev.buildRevisionPreview(draft, text, pid);
    assert(out.kind === 'preview', `buildRevisionPreview kind=${out.kind} (${JSON.stringify(out).slice(0, 400)})`);
    return (out as { kind: 'preview'; preview: rev.RevisionPreview }).preview;
  };
  const partFor = (draft: Draft, buildingId: string) =>
    draft.parts.find((p) => p.buildingId === buildingId);
  const sectionTotal = (draft: Draft, key: string) =>
    rab.computeSectionTotals(draft).find((s) => s.key === key)?.totals.estimatedTotal;

  /* ============ 5C-01 — versi lama immutable (byte-identik) ============ */
  await check('5C-01 versi lama byte-identik sesudah revisi (v1 seed + sesudah revisi kedua)', () => {
    const { pid, draft } = buildSavedMulti();
    const v1Canon = canon(draft);
    const p1 = previewOf(draft, pid, 'gedung B jadi 3 lantai');
    const a1 = rev.activateRevision(pid, p1);
    assert(a1.ok, `aktivasi 1 gagal: ${JSON.stringify(a1)}`);
    const rec1 = dp.peekPersistedDraft(pid)!;
    assert(rec1.baseVersion === 2, `baseVersion=${rec1.baseVersion}, harap 2`);
    assert((rec1.versionHistory ?? []).length === 2, `history=${(rec1.versionHistory ?? []).length}, harap 2 (seed v1 + v2)`);
    const seed = rec1.versionHistory!.find((h) => h.version === 1)!;
    assert(seed, 'snapshot v1 tidak ada di riwayat');
    eq(canon(seed.draft), v1Canon, 'snapshot v1 TIDAK byte-identik dengan draft pra-revisi');
    // Revisi kedua — v1 harus TETAP identik.
    const active2 = rab.getLastUniversalDraft(pid)!;
    const p2 = previewOf(active2, pid, 'gedung B jadi 4 lantai');
    const a2 = rev.activateRevision(pid, p2);
    assert(a2.ok, `aktivasi 2 gagal: ${JSON.stringify(a2)}`);
    const rec2 = dp.peekPersistedDraft(pid)!;
    assert((rec2.versionHistory ?? []).length === 3, `history=${(rec2.versionHistory ?? []).length}, harap 3`);
    const seed2 = rec2.versionHistory!.find((h) => h.version === 1)!;
    eq(canon(seed2.draft), v1Canon, 'snapshot v1 BERUBAH sesudah revisi kedua');
    const v2snap = rec2.versionHistory!.find((h) => h.version === 2)!;
    assert(v2snap.activationKey === p1.activationKey, 'snapshot v2 tidak membawa kunci aktivasi p1');
  });

  /* ============ 5C-02 — versi baru benar (hanya yang diminta) ============ */
  await check('5C-02 versi baru benar: hanya Gedung B berubah, sisanya identik', () => {
    const { pid, draft } = buildSavedMulti();
    const aBefore = canon(partFor(draft, 'gedung-a'));
    const sharedBefore = canon(draft.parts.find((p) => p.sectionKind === 'shared-works'));
    const p1 = previewOf(draft, pid, 'gedung B jadi 3 lantai');
    assert(p1.before.estimatedTotal === 924102500, `before total=${p1.before.estimatedTotal}`);
    assert(p1.affectedBuildings.length === 1 && p1.affectedBuildings[0] === 'Gedung B', `affected=${JSON.stringify(p1.affectedBuildings)}`);
    assert(p1.unchangedSections.includes('Gedung A'), `unchanged=${JSON.stringify(p1.unchangedSections)}`);
    assert(p1.reconciled, 'pratinjau tidak terekonsiliasi');
    const a1 = rev.activateRevision(pid, p1);
    assert(a1.ok, `aktivasi gagal: ${JSON.stringify(a1)}`);
    const active = rab.getLastUniversalDraft(pid)!;
    assert(active.version === 2, `version=${active.version}`);
    eq(canon(partFor(active, 'gedung-a')), aBefore, 'part Gedung A berubah padahal hanya B yang direvisi');
    eq(canon(active.parts.find((p) => p.sectionKind === 'shared-works')), sharedBefore, 'part shared works berubah');
    assert(partFor(active, 'gedung-b')?.evaluatedParams?.num_floors === 3, 'Gedung B bukan 3 lantai');
    assert(sectionTotal(active, 'gedung-a') === 461492500, `subtotal A=${sectionTotal(active, 'gedung-a')}`);
    const rec = rab.reconcileMultiBuildingTotals(active);
    assert(rec.balanced && rec.diffRp === 0, `rekonsiliasi sesudah aktivasi: diff=${rec.diffRp}`);
  });

  /* ============ 5C-03 — revisi gagal mempertahankan versi aktif ============ */
  await check('5C-03 revisi gagal (ditolak + throw) mempertahankan versi aktif', () => {
    const { pid, draft } = buildSavedMulti();
    const beforeCanon = canon(draft);
    const storeBefore = storageSnapshot();
    // (a) Ditolak: revisi ambigu tanpa alamat gedung.
    const out = rev.buildRevisionPreview(draft, 'ubah jumlah lantai menjadi 5 lantai', pid);
    assert(out.kind === 'rejected', `kind=${out.kind}, harap rejected`);
    assert(dp.peekPersistedDraft(pid)!.baseVersion === 1, 'record berubah sesudah penolakan');
    eq(canon(rab.getLastUniversalDraft(pid)), beforeCanon, 'singleton berubah sesudah penolakan');
    eq(storageSnapshot(), storeBefore, 'storage berubah sesudah penolakan');
    // (b) Throw: part korup (template null) + revisi ukuran global.
    const single = buildMulti('buatkan RAB drainase U-Ditch sepanjang 500 meter');
    const pid2 = nextPid();
    rab.setLastUniversalDraft(single, pid2);
    dp.saveDraft({ draft: single, projectId: pid2 });
    const singleBefore = canon(single);
    (single.parts[0] as unknown as { template: null }).template = null;
    const out2 = rev.buildRevisionPreview(single, 'ubah panjang menjadi 600 m', pid2);
    assert(out2.kind === 'rejected', `kind throw=${out2.kind}, harap rejected`);
    assert(rab.getLastUniversalDraft(pid2) === single, 'singleton TIDAK dipulihkan sesudah throw');
    assert(dp.peekPersistedDraft(pid2)!.baseVersion === 1, 'record berubah sesudah throw');
    void singleBefore;
  });

  /* ============ 5C-04 — aktivasi butuh konfirmasi eksplisit ============ */
  await check('5C-04 tanpa konfirmasi: pratinjau saja, versi aktif + storage tidak berubah', () => {
    const { pid, draft } = buildSavedMulti();
    const storeBefore = storageSnapshot();
    const p1 = previewOf(draft, pid, 'gedung B jadi 3 lantai');
    assert(p1.targetVersion === 2, `target=${p1.targetVersion}`);
    assert(rab.getLastUniversalDraft(pid) === draft, 'singleton berganti hanya karena pratinjau');
    assert(rab.getLastUniversalDraft(pid)!.version === 1, 'versi singleton naik tanpa konfirmasi');
    assert(dp.peekPersistedDraft(pid)!.baseVersion === 1, 'record naik tanpa konfirmasi');
    assert(!dp.peekPersistedDraft(pid)!.versionHistory, 'riwayat muncul tanpa konfirmasi');
    eq(storageSnapshot(), storeBefore, 'storage ditulis hanya karena pratinjau');
    // Pratinjau TIDAK mengaktifkan dirinya sendiri walau dibaca/diformat.
    const msg = rev.formatRevisionPreviewMessage(p1);
    assert(msg.includes('BELUM AKTIF'), 'pesan pratinjau tidak menyatakan BELUM AKTIF');
    assert(msg.includes('Tetap') || msg.includes('TETAP'), 'pesan pratinjau tidak menyatakan versi aktif tetap');
    assert(dp.peekPersistedDraft(pid)!.baseVersion === 1, 'record berubah sesudah format pesan');
  });

  /* ============ 5C-05 — revisi bersamaan: satu pemenang deterministik ============ */
  await check('5C-05 dua revisi dari basis sama: satu menang, satu ditolak stale secara jujur', () => {
    const { pid, draft } = buildSavedMulti();
    const p1 = previewOf(draft, pid, 'gedung B jadi 3 lantai');
    const p2 = previewOf(draft, pid, 'gedung B jadi 4 lantai');
    assert(p1.activationKey !== p2.activationKey, 'dua permintaan berbeda berbagi kunci');
    const a1 = rev.activateRevision(pid, p1);
    assert(a1.ok && !a1.alreadyActivated, `aktivasi p1 gagal: ${JSON.stringify(a1)}`);
    const a2 = rev.activateRevision(pid, p2);
    assert(!a2.ok, 'aktivasi p2 (stale) DITERIMA — seharusnya ditolak');
    assert((a2 as { stale?: boolean }).stale === true, `p2 tidak ditandai stale: ${JSON.stringify(a2)}`);
    const active = rab.getLastUniversalDraft(pid)!;
    assert(active.version === 2, `version=${active.version}, harap 2 (satu pemenang)`);
    assert(partFor(active, 'gedung-b')?.evaluatedParams?.num_floors === 3, 'pemenang bukan p1 (B=3)');
    const rec = dp.peekPersistedDraft(pid)!;
    assert((rec.versionHistory ?? []).length === 2, `history=${(rec.versionHistory ?? []).length}, harap 2 (tanpa v3 hantu)`);
    // Yang kalah dapat kirim ulang dari versi terbaru — dan berhasil.
    const p3 = previewOf(active, pid, 'gedung B jadi 4 lantai');
    const a3 = rev.activateRevision(pid, p3);
    assert(a3.ok, `aktivasi ulang dari v2 gagal: ${JSON.stringify(a3)}`);
    assert(rab.getLastUniversalDraft(pid)!.version === 3, 'versi tidak naik ke 3 sesudah kirim ulang');
  });

  /* ============ 5C-06 — aktivasi idempotent ============ */
  await check('5C-06 aktivasi ganda dengan kunci sama = satu versi', () => {
    const { pid, draft } = buildSavedMulti();
    const p1 = previewOf(draft, pid, 'gedung B jadi 3 lantai');
    const a1 = rev.activateRevision(pid, p1);
    assert(a1.ok && !a1.alreadyActivated, `aktivasi 1: ${JSON.stringify(a1)}`);
    const histBefore = JSON.stringify(dp.peekPersistedDraft(pid)!.versionHistory);
    const a2 = rev.activateRevision(pid, p1);
    assert(a2.ok, `aktivasi 2 gagal: ${JSON.stringify(a2)}`);
    assert(a2.alreadyActivated === true, 'aktivasi 2 tidak ditandai alreadyActivated');
    assert(a2.version === 2, `versi aktivasi 2 = ${a2.version}, harap 2`);
    assert(dp.peekPersistedDraft(pid)!.baseVersion === 2, 'baseVersion naik sesudah aktivasi ganda');
    eq(JSON.stringify(dp.peekPersistedDraft(pid)!.versionHistory), histBefore, 'riwayat berubah sesudah aktivasi ganda');
    // Kunci deterministik: pratinjau ulang permintaan yang sama dari
    // basis yang sama menghasilkan kunci yang sama.
    const p1b = previewOf(draft, pid, 'gedung B jadi 3 lantai');
    assert(p1b.activationKey === p1.activationKey, 'kunci tidak deterministik untuk permintaan sama');
  });

  /* ============ 5C-07 — revisi per gedung (QTO + part) ============ */
  await check('5C-07 revisi Gedung B: Gedung A byte-identik termasuk QTO & part', () => {
    const { pid, draft } = buildSavedMulti();
    const buildingA = draft.buildings!.find((b) => b.id === 'gedung-a')!;
    const qtoBefore = mbr.checkBuildingQto(draft, buildingA);
    const partBefore = canon(partFor(draft, 'gedung-a'));
    const itemsBefore = canon(
      rab.effectiveItems(draft).filter((i) => i.__buildingId === 'gedung-a'),
    );
    const p1 = previewOf(draft, pid, 'Ubah Gedung B dari 2 lantai jadi 3 lantai');
    const a1 = rev.activateRevision(pid, p1);
    assert(a1.ok, `aktivasi gagal: ${JSON.stringify(a1)}`);
    const active = rab.getLastUniversalDraft(pid)!;
    const buildingA2 = active.buildings!.find((b) => b.id === 'gedung-a')!;
    eq(canon(buildingA2), canon(buildingA), 'model Gedung A berubah');
    eq(canon(partFor(active, 'gedung-a')), partBefore, 'part Gedung A berubah');
    eq(
      canon(rab.effectiveItems(active).filter((i) => i.__buildingId === 'gedung-a')),
      itemsBefore,
      'item Gedung A berubah',
    );
    eq(canon(mbr.checkBuildingQto(active, buildingA2)), canon(qtoBefore), 'QTO Gedung A berubah');
    assert(partFor(active, 'gedung-b')?.evaluatedParams?.num_floors === 3, 'Gedung B bukan 3 lantai ("dari 2 jadi 3" salah parse?)');
  });

  /* ============ 5C-08 — ambigu → klarifikasi, bukan tebakan ============ */
  await check('5C-08 permintaan ambigu → klarifikasi tertarget, bukan tebakan', () => {
    const { pid, draft } = buildSavedMulti();
    const cases: Array<[string, string]> = [
      ['ubah atapnya', 'atap'],
      ['tambah luas bangunan', 'luas'],
      ['Ganti atap Gedung A', 'atap'],
      ['revisi budget', 'budget'],
    ];
    for (const [text, keyword] of cases) {
      const out = rev.buildRevisionPreview(draft, text, pid);
      assert(out.kind === 'clarification', `"${text}": kind=${out.kind}, harap clarification`);
      const msg = (out as { kind: 'clarification'; message: string }).message.toLowerCase();
      assert(msg.includes(keyword), `"${text}": pesan klarifikasi tidak menyebut ${keyword}`);
      assert(dp.peekPersistedDraft(pid)!.baseVersion === 1, `"${text}": record berubah`);
      assert(rab.getLastUniversalDraft(pid)!.version === 1, `"${text}": singleton berubah`);
    }
    // Hapus berdasarkan nama yang ada di kedua gedung → klarifikasi gedung.
    const items = rab.effectiveItems(draft);
    const sharedName = items.find(
      (i) => i.__buildingId === 'gedung-a'
        && items.some((j) => j.__buildingId === 'gedung-b' && j.description === i.description),
    );
    assert(sharedName, 'tidak ada nama item yang sama di kedua gedung (prasyarat tes)');
    const firstWord = sharedName!.description.split(' ')[0];
    const outName = rev.buildRevisionPreview(draft, `hapus ${firstWord}`, pid);
    assert(
      outName.kind === 'clarification' || outName.kind === 'rejected',
      `hapus nama lintas gedung: kind=${outName.kind}, harap clarification/rejected (bukan preview menebak gedung)`,
    );
  });

  /* ============ 5C-09 — revisi budget tidak mengubah spek ============ */
  await check('5C-09 revisi budget: hanya budgetCap berubah, spek terkonfirmasi utuh', () => {
    const { pid, draft } = buildSavedMulti(MULTI_BUDGET_TEXT);
    assert(draft.spec.budgetCap === 900000000, `budgetCap awal=${draft.spec.budgetCap}`);
    const specBefore = JSON.stringify({ ...draft.spec, budgetCap: null });
    const totalBefore = rab.computeTotals(draft).estimatedTotal;
    const p1 = previewOf(draft, pid, 'revisi budget menjadi Rp 800 juta');
    assert(p1.after.estimatedTotal === totalBefore, `total berubah oleh revisi budget: ${p1.after.estimatedTotal} vs ${totalBefore}`);
    assert(p1.candidate.spec.budgetCap === 800000000, `cap kandidat=${p1.candidate.spec.budgetCap}`);
    eq(
      JSON.stringify({ ...p1.candidate.spec, budgetCap: null }),
      specBefore,
      'spek selain budgetCap BERUBAH oleh revisi budget',
    );
    assert(p1.budgetNote != null && p1.budgetNote.length > 0, 'pratinjau budget tanpa penilaian kelayakan');
    const a1 = rev.activateRevision(pid, p1);
    assert(a1.ok, `aktivasi gagal: ${JSON.stringify(a1)}`);
    const active = rab.getLastUniversalDraft(pid)!;
    assert(active.spec.budgetCap === 800000000, `cap aktif=${active.spec.budgetCap}`);
    eq(JSON.stringify({ ...active.spec, budgetCap: null }), specBefore, 'spek aktif berubah sesudah aktivasi budget');
    assert(active.spec.floors === draft.spec.floors, 'lantai proyek berubah');
    assert(active.spec.areaM2 === draft.spec.areaM2, 'luas proyek berubah');
  });

  /* ============ 5C-10 — reload memulihkan versi aktif + riwayat ============ */
  await check('5C-10 reload: versi aktif + riwayat pulih identik', () => {
    const { pid, draft } = buildSavedMulti();
    const v1Canon = canon(draft);
    const p1 = previewOf(draft, pid, 'gedung B jadi 3 lantai');
    const a1 = rev.activateRevision(pid, p1);
    assert(a1.ok, `aktivasi gagal: ${JSON.stringify(a1)}`);
    const activeBefore = canon(rab.getLastUniversalDraft(pid));
    // Simulasi reload: singleton dibersihkan TANPA menyentuh storage.
    rab.setLastUniversalDraft(null);
    assert(rab.getLastUniversalDraft() === null, 'singleton tidak bersih (prasyarat reload)');
    const loaded = dp.loadDraft(pid);
    assert(loaded.ok, `loadDraft gagal: ${JSON.stringify(loaded)}`);
    if (loaded.ok) {
      eq(canon(loaded.draft), activeBefore, 'draft aktif sesudah reload TIDAK identik');
      assert(loaded.draft.version === 2, `versi pulih=${loaded.draft.version}`);
      assert((loaded.meta.versionHistory ?? []).length === 2, `riwayat pulih=${(loaded.meta.versionHistory ?? []).length}`);
      const seed = loaded.meta.versionHistory!.find((h) => h.version === 1)!;
      eq(canon(seed.draft), v1Canon, 'snapshot v1 sesudah reload TIDAK identik');
      // Snapshot intake Gate 1 tetap tertaut ke draftId yang sama
      // (revisi tidak membuat draft baru — draftId stabil antar versi).
      assert(loaded.draft.id === draft.id, 'draftId berubah antar versi');
    }
    // Revisi lanjutan sesudah reload tetap berfungsi dari versi pulih.
    rab.setLastUniversalDraft(loaded.ok ? loaded.draft : null, pid);
    const active2 = rab.getLastUniversalDraft(pid)!;
    const p2 = previewOf(active2, pid, 'gedung B jadi 4 lantai');
    const a2 = rev.activateRevision(pid, p2);
    assert(a2.ok, `aktivasi pasca-reload gagal: ${JSON.stringify(a2)}`);
  });

  /* ============ 5C-11 — hapus komponen yang belum disetujui ============ */
  await check('5C-11 hapus komponen belum disetujui: hanya item itu yang hilang', () => {
    const { pid, draft } = buildSavedMulti();
    // Tandai 2 item sebagai belum disetujui (harga belum tersedia).
    const victimPart = draft.parts[0];
    const victims = victimPart.generation.items.slice(0, 2);
    assert(victims.length === 2, 'prasyarat: part pertama punya ≥2 item');
    for (const it of victims) {
      (it as { priceStatus: string }).priceStatus = 'PRICE_UNRESOLVED';
      (it as { unitPrice: number }).unitPrice = 0;
    }
    const victimDescs = victims.map((i) => i.description);
    const totalItemsBefore = rab.effectiveItems(draft).length;
    const saved = dp.saveDraft({ draft, projectId: pid });
    assert(saved.ok, `simpan ulang gagal: ${JSON.stringify(saved)}`);
    const p1 = previewOf(draft, pid, 'hapus komponen yang belum disetujui');
    eq(p1.after.itemCount, totalItemsBefore - 2, `item sesudah=${p1.after.itemCount}, harap ${totalItemsBefore - 2}`);
    const afterDescs = rab.effectiveItems(p1.candidate).map((i) => i.description);
    for (const d of victimDescs) assert(!afterDescs.includes(d), `item "${d}" masih ada di kandidat`);
    const a1 = rev.activateRevision(pid, p1);
    assert(a1.ok, `aktivasi gagal: ${JSON.stringify(a1)}`);
    const active = rab.getLastUniversalDraft(pid)!;
    assert(rab.effectiveItems(active).length === totalItemsBefore - 2, 'item aktif tidak berkurang tepat 2');
    // v1 (seed) TETAP memuat kedua item itu — penghapusan hanya di v2.
    const rec = dp.peekPersistedDraft(pid)!;
    const seed = rec.versionHistory!.find((h) => h.version === 1)!;
    const seedDescs = rab.effectiveItems(seed.draft).map((i) => i.description);
    for (const d of victimDescs) assert(seedDescs.includes(d), `item "${d}" hilang dari snapshot v1`);
    // Bila tidak ada item unresolved → ditolak jujur, bukan menghapus acak.
    const out2 = rev.buildRevisionPreview(active, 'hapus komponen yang belum disetujui', pid);
    assert(out2.kind === 'rejected', `tanpa unresolved: kind=${out2.kind}, harap rejected`);
  });

  /* ============ 5C-12 — "dari X jadi Y" + ganti dengan ============ */
  await check('5C-12 parse revisi NL: "dari 2 lantai jadi 3 lantai" → 3; "ganti X dengan Y" dikenali', () => {
    const patch = mbr.parseBuildingRevision('Ubah Gedung B dari 2 lantai jadi 3 lantai');
    assert(patch != null && patch.floors === 3, `parse "dari 2 jadi 3": ${JSON.stringify(patch)}`);
    const patch2 = mbr.parseBuildingRevision('gedung B jadi 4 lantai');
    assert(patch2 != null && patch2.floors === 4, `parse "jadi 4": ${JSON.stringify(patch2)}`);
    const patch3 = mbr.parseBuildingRevision('gedung B 14 x 9 m');
    assert(patch3 != null && patch3.lengthM === 14 && patch3.widthM === 9, `parse dimensi: ${JSON.stringify(patch3)}`);
    // "ganti atap dengan baja ringan" dikenali mesin revisi (bukan null):
    // diterapkan bila varian cocok, atau ditolak jujur bila tidak ada
    // varian di katalog untuk cakupan draft ini — keduanya membuktikan
    // bentuk "dengan" dikenali sebagai percobaan ganti (bukan jatuh
    // ke routing sebagai pesan tak dikenal).
    const multi = buildMulti();
    const res = rab.reviseUniversalDraft(multi, 'ganti atap dengan baja ringan');
    assert(res !== null, '"ganti X dengan Y" tidak dikenali mesin revisi');
    const resJadi = rab.reviseUniversalDraft(buildMulti(), 'ganti atap jadi baja ringan');
    assert(resJadi !== null, '"ganti X jadi Y" tidak dikenali mesin revisi');
  });

  /* ============ 5C-13 — riwayat & perbandingan ============ */
  await check('5C-13 riwayat + perbandingan antar versi', () => {
    const { pid, draft } = buildSavedMulti();
    const p1 = previewOf(draft, pid, 'gedung B jadi 3 lantai');
    const a1 = rev.activateRevision(pid, p1);
    assert(a1.ok, `aktivasi gagal: ${JSON.stringify(a1)}`);
    const hist = rev.listVersionHistory(pid);
    assert(hist.activeVersion === 2, `aktif=${hist.activeVersion}`);
    assert(hist.snapshots.length === 2, `snapshot=${hist.snapshots.length}`);
    const histMsg = rev.formatVersionHistoryMessage(pid);
    assert(histMsg.includes('v1') && histMsg.includes('v2'), 'pesan riwayat tidak memuat v1+v2');
    assert(histMsg.includes('AKTIF'), 'pesan riwayat tidak menandai versi aktif');
    const cmp = rev.compareStoredVersions(pid, 1, 2);
    assert(cmp.includes('924.102.500') || cmp.includes('Rp 924'), `perbandingan tidak memuat total v1: ${cmp.slice(0, 200)}`);
    assert(cmp.includes('Gedung B') && cmp.includes('BERUBAH'), 'perbandingan tidak menandai Gedung B berubah');
    assert(cmp.includes('Gedung A') && cmp.includes('tidak berubah'), 'perbandingan tidak menandai Gedung A utuh');
    const cmpMissing = rev.compareStoredVersions(pid, 1, 9);
    assert(cmpMissing.includes('tidak punya snapshot'), 'versi hilang tidak dinyatakan jujur');
  });

  /* ============ 5C-14 — revisi budget pada draft tanpa budget ============ */
  await check('5C-14 revisi budget menetapkan cap baru; total + spek tidak berubah', () => {
    const { pid, draft } = buildSavedMulti();
    assert(draft.spec.budgetCap == null, `prasyarat: budgetCap=${draft.spec.budgetCap}`);
    const totalBefore = rab.computeTotals(draft).estimatedTotal;
    const p1 = previewOf(draft, pid, 'revisi budget menjadi Rp 1 miliar');
    assert(p1.candidate.spec.budgetCap === 1000000000, `cap=${p1.candidate.spec.budgetCap}`);
    assert(p1.after.estimatedTotal === totalBefore, 'total berubah oleh penetapan budget');
    assert(p1.before.itemCount === p1.after.itemCount, 'jumlah item berubah oleh penetapan budget');
    const a1 = rev.activateRevision(pid, p1);
    assert(a1.ok, `aktivasi gagal: ${JSON.stringify(a1)}`);
  });

  /* ============ S5C — asersi sumber ============ */
  await check('S5C-01 view: revisi lewat buildRevisionPreview, bukan revise langsung', () => {
    const view = readFileSync(new URL('../ai-tools/ezrab-ai/view.tsx', import.meta.url), 'utf8');
    assert(view.includes('buildRevisionPreview'), 'view tidak memakai buildRevisionPreview');
    // Tidak ada PEMANGGILAN / IMPOR revise langsung (penyebutan nama di
    // komentar penjelas diperbolehkan — yang dilarang adalah pemakaian).
    assert(!view.includes('reviseUniversalDraft('), 'view masih memanggil reviseUniversalDraft langsung');
    assert(!view.includes('reviseUniversalDraft,'), 'view masih mengimpor reviseUniversalDraft');
    assert(view.includes('revision-confirm') && view.includes('revision-cancel'), 'view tanpa tombol konfirmasi/batal revisi');
    assert(view.includes('pendingRevisionRef'), 'view tanpa state pratinjau menunggu');
    assert(view.includes('isAffirmativeConfirmation'), 'view tanpa konfirmasi teks');
    // Perintah banding menerima "bandingkan versi 1 dan 3" (tanpa kata
    // "versi" kedua) — regresi E2E putaran 1: pola lama mewajibkan
    // "versi" kedua sehingga perintah jatuh ke LLM.
    assert(view.includes('(?:versi\\s*)?(\\d+)'), 'pola banding versi tidak menerima bentuk tanpa "versi" kedua');
  });
  await check('S5C-02 draftPersistence: riwayat diteruskan + tulis atomik tersedia', () => {
    const src = readFileSync(new URL('../ai-tools/ezrab-ai/draftPersistence.ts', import.meta.url), 'utf8');
    assert(src.includes('versionHistory'), 'draftPersistence tanpa versionHistory');
    assert(src.includes('writeDraftRecord'), 'draftPersistence tanpa writeDraftRecord');
    assert(src.includes('DRAFT_SCHEMA_VERSION = 1'), 'versi skema berubah (harus tetap 1)');
  });
  await check('S5C-03 draftRevision: penjaga stale + kunci deterministik + tanpa secret', () => {
    const src = readFileSync(new URL('../ai-tools/ezrab-ai/draftRevision.ts', import.meta.url), 'utf8');
    assert(src.includes('deriveIdempotencyKey'), 'tanpa kunci deterministik toolRegistry');
    assert(src.includes('baseUpdatedAt'), 'tanpa penjaga baseUpdatedAt');
    assert(src.includes('alreadyActivated'), 'tanpa jalur idempotent');
    assert(!/api[_-]?key|secret|token/i.test(src.replace(/activationKey/g, '')), 'modul revisi menyebut pola kredensial');
  });

  console.log(`\nchatPhase5Revision: ${passed} passed, ${failed} failed${failures.length ? ` — GAGAL: ${failures.join(', ')}` : ''}`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error('SUITE CRASH:', e);
  process.exitCode = 2;
});

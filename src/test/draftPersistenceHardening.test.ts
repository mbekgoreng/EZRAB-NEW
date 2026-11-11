/**
 * FINAL HARDENING §2/§4/§9 — persistensi draft tahan-refresh, verifikasi
 * rantai transfer, performa/integritas (2026-11-11).
 *
 * Dijalankan bergaya vitest lewat shim lokal (di luar repo):
 *   npx tsx <runner> src/test/draftPersistenceHardening.test.ts
 *
 * Cakupan jujur: ProjectContext.bulkAddRabItems adalah closure React —
 * seperti pola sprint3Finalization/rabPersistenceProvenance, rantai
 * store diuji lewat SIMULASI yang menyusun helper ASLI yang sama dengan
 * urutan yang sama (gerbang proyek → cek kunci finalisasi → factory
 * createRabItemRecord → catat kunci → persist via hardenedStorage),
 * ditambah pemeriksaan kontrak-sumber untuk wiring view yang tidak
 * dapat dieksekusi tanpa React live. Semua modul persistensi, payload,
 * kunci, factory, dan engine finansial yang diuji adalah modul ASLI.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import {
  buildUniversalDraft,
  reviseUniversalDraft,
  effectiveItems,
  buildPushPayload,
  validateTransfer,
  applyTransferReceipt,
  setLastUniversalDraft,
  isPriceValidForTotal,
  type UniversalDraft,
} from '../ai-tools/ezrab-ai/universalRab';
import {
  saveDraft,
  loadDraft,
  markTransferred,
  peekPersistedDraft,
  AI_DRAFTS_STORAGE_KEY,
} from '../ai-tools/ezrab-ai/draftPersistence';
import { buildFinalizationKey } from '../ai-tools/ded-ai-estimate/finalizationKey';
import {
  isFinalizationKeyApplied,
  applyFinalizationKey,
  type FinalizationKeyRegistry,
} from '../context/ProjectContext';
import { saveVersioned, loadVersioned } from '../engine/storage/hardenedStorage';
import { createRabItemRecord } from '../engine/rab/rabItemFactory';
import { UnifiedProjectEngine } from '../engine/unifiedProjectEngine';
import { EzrabAiService } from '../ai-tools/ezrab-ai/service';
import { aiToolsProviderClient } from '../ai-tools/providerClient';
import type { RabItem } from '../types';

/* ---------------- localStorage shim (dengan penghitung tulis) ------- */
const store: Record<string, string> = {};
let quotaMode = false;
const writeCounts: Record<string, number> = {};
// Dipasang sebagai global langsung (bukan vi.stubGlobal — no-op pada
// runner fase ini); pola sama seperti suite rabPersistenceProvenance.
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => {
    if (quotaMode) {
      const e = new Error('QuotaExceededError: quota exceeded');
      e.name = 'QuotaExceededError';
      throw e;
    }
    writeCounts[k] = (writeCounts[k] ?? 0) + 1;
    store[k] = v;
  },
  removeItem: (k: string) => { delete store[k]; },
  clear: () => { for (const k of Object.keys(store)) delete store[k]; },
};

const PID = 'PRJ-DRAFT-1';
const PID2 = 'PRJ-DRAFT-2';

function draftOf(text: string): UniversalDraft {
  const res = buildUniversalDraft(text);
  expect(res.kind).toBe('draft');
  if (res.kind !== 'draft') throw new Error('unreachable');
  return res.draft;
}

beforeEach(() => {
  localStorage.clear();
  for (const k of Object.keys(writeCounts)) delete writeCounts[k];
  quotaMode = false;
  setLastUniversalDraft(null);
});

/* ================================================================== */
/* §2 — Siklus hidup persistensi draft                                 */
/* ================================================================== */

describe('§2 persistensi draft — siklus hidup lengkap', () => {
  it('buat → persist → revisi → persist → refresh → pulih identik → revisi lanjut', () => {
    const d = draftOf('buatkan RAB drainase U-Ditch sepanjang 500 meter');
    const itemsBefore = effectiveItems(d);
    expect(itemsBefore.length).toBeGreaterThan(0);

    const s1 = saveDraft({ draft: d, projectId: PID, conversationId: 'conv-1', workflowStage: 'generated' });
    expect(s1.ok).toBe(true);

    const rev = reviseUniversalDraft(d, 'gunakan harga manual Rp 900.000 untuk item 1');
    expect(rev?.changed).toBe(true);
    const s2 = saveDraft({ draft: d, projectId: PID, workflowStage: 'revised' });
    expect(s2.ok).toBe(true);
    expect(peekPersistedDraft(PID)?.revisionMeta.savedCount).toBe(2);

    // "Refresh": singleton modul diabaikan/dikosongkan; baca dari storage dingin.
    setLastUniversalDraft(null);
    const loaded = loadDraft(PID);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) throw new Error('unreachable');
    expect(loaded.draft.id).toBe(d.id);
    expect(loaded.draft.version).toBe(d.version);
    expect(loaded.meta.conversationId).toBe('conv-1');
    // Item efektif hasil restore IDENTIK (deskripsi/volume/satuan/harga/status)
    // — membuktikan parts+generation murni data JSON dan restore setara.
    const restoredItems = effectiveItems(loaded.draft);
    const nowItems = effectiveItems(d);
    expect(restoredItems.length).toBe(nowItems.length);
    restoredItems.forEach((it, i) => {
      expect(it.description).toBe(nowItems[i].description);
      expect(it.volume).toBe(nowItems[i].volume);
      expect(it.unit).toBe(nowItems[i].unit);
      expect(it.unitPrice).toBe(nowItems[i].unitPrice);
      expect(it.priceStatus ?? null).toBe(nowItems[i].priceStatus ?? null);
    });
    // Harga manual hasil revisi ikut pulih (manualPrices tersimpan di parts).
    expect(restoredItems.some((i) => i.priceStatus === 'PRICE_MANUAL' && i.unitPrice === 900000)).toBe(true);

    // Revisi LANJUT pada draft hasil restore tetap bekerja.
    const rev2 = reviseUniversalDraft(loaded.draft, 'ubah panjang menjadi 600 m');
    expect(rev2?.changed).toBe(true);
    const s3 = saveDraft({ draft: loaded.draft, projectId: PID, workflowStage: 'revised' });
    expect(s3.ok).toBe(true);
  });

  it('satu record per proyek; proyek lain tidak tertukar', () => {
    const d1 = draftOf('buatkan RAB drainase U-Ditch sepanjang 500 meter');
    const d2 = draftOf('Buatkan RAB gedung kantor 3 lantai luas 900 m²');
    expect(saveDraft({ draft: d1, projectId: PID }).ok).toBe(true);
    expect(saveDraft({ draft: d2, projectId: PID2 }).ok).toBe(true);
    expect(loadDraft(PID).ok && (loadDraft(PID) as { draft: UniversalDraft }).draft.id).toBe(d1.id);
    const l2 = loadDraft(PID2);
    expect(l2.ok).toBe(true);
    if (l2.ok) expect(l2.draft.id).toBe(d2.id);
    const missing = loadDraft('PRJ-TIDAK-ADA');
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error).toBe('DRAFT_NOT_FOUND');
  });

  it('autosave idempoten: draft sama persis tidak menulis ulang', () => {
    const d = draftOf('buatkan RAB drainase U-Ditch sepanjang 500 meter');
    expect(saveDraft({ draft: d, projectId: PID }).ok).toBe(true);
    const writesAfterFirst = writeCounts[AI_DRAFTS_STORAGE_KEY] ?? 0;
    const again = saveDraft({ draft: d, projectId: PID });
    expect(again.ok).toBe(true);
    if (again.ok) expect(again.deduplicated).toBe(true);
    expect(writeCounts[AI_DRAFTS_STORAGE_KEY] ?? 0).toBe(writesAfterFirst);
  });

  it('konflik versi: penulisan basi (snapshot versi lama) ditolak', () => {
    const d = draftOf('Buatkan RAB gedung kantor 3 lantai luas 900 m²');
    expect(saveDraft({ draft: d, projectId: PID }).ok).toBe(true);
    const staleSnapshot = JSON.parse(JSON.stringify(d)) as UniversalDraft;
    const rev = reviseUniversalDraft(d, 'ubah luas menjadi 800 m2');
    expect(rev?.changed).toBe(true);
    expect(saveDraft({ draft: d, projectId: PID }).ok).toBe(true);
    const stale = saveDraft({ draft: staleSnapshot, projectId: PID });
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.error).toBe('DRAFT_VERSION_CONFLICT');
    // Record tersimpan tetap versi baru.
    expect(peekPersistedDraft(PID)?.baseVersion).toBe(d.version);
  });

  it('konflik updatedAt: expectedUpdatedAt basi ditolak', () => {
    const d = draftOf('buatkan RAB drainase U-Ditch sepanjang 500 meter');
    const s1 = saveDraft({ draft: d, projectId: PID });
    expect(s1.ok).toBe(true);
    const stale = saveDraft({ draft: d, projectId: PID, expectedUpdatedAt: '2000-01-01T00:00:00.000Z' });
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.error).toBe('DRAFT_VERSION_CONFLICT');
  });

  it('skema tak dikenal ditolak fail-closed (tanpa tebakan migrasi)', () => {
    const d = draftOf('buatkan RAB drainase U-Ditch sepanjang 500 meter');
    expect(saveDraft({ draft: d, projectId: PID }).ok).toBe(true);
    const rec = peekPersistedDraft(PID)!;
    saveVersioned(AI_DRAFTS_STORAGE_KEY, { [PID]: { ...rec, schemaVersion: 99 } });
    const loaded = loadDraft(PID);
    expect(loaded.ok).toBe(false);
    if (!loaded.ok) expect(loaded.error).toBe('DRAFT_SCHEMA_UNSUPPORTED');
  });

  it('quota-exceeded terlihat sebagai error terstruktur, bukan sukses palsu', () => {
    const d = draftOf('buatkan RAB drainase U-Ditch sepanjang 500 meter');
    quotaMode = true;
    const res = saveDraft({ draft: d, projectId: PID });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('DRAFT_QUOTA_EXCEEDED');
    quotaMode = false;
    expect(peekPersistedDraft(PID)).toBeNull();
  });

  it('record memuat provenans per item + daftar unresolved + spec apa adanya', () => {
    const d = draftOf('buatkan RAB drainase U-Ditch sepanjang 500 meter');
    expect(saveDraft({ draft: d, projectId: PID }).ok).toBe(true);
    const rec = peekPersistedDraft(PID)!;
    expect(rec.schemaVersion).toBe(1);
    expect(rec.spec).toEqual(d.spec);
    expect(rec.priceProvenance.length).toBe(effectiveItems(d).length);
    // Jujur: tidak ada sumber confirmed/pending terpisah di struktur kini.
    expect(rec.confirmedSpecs).toBeNull();
    expect(rec.pendingSpecs).toBeNull();
    expect(rec.draftStatus).toBe('draft');
  });
});

/* ================================================================== */
/* §2+§4 — Harga tak-teresolusi utuh sesudah round-trip                */
/* ================================================================== */

describe('§2/§4 provenans tak-teresolusi round-trip', () => {
  it('item PRICE_UNRESOLVED: tanpa unitPrice di payload, tetap unresolved sesudah simpan-baca-balik, tidak masuk total', () => {
    const base = draftOf('buatkan RAB drainase U-Ditch sepanjang 500 meter');
    const d = JSON.parse(JSON.stringify(base)) as UniversalDraft;
    // Paksa item pertama menjadi tak-teresolusi (sentinel kontrak lama:
    // unitPrice null di draft; JANGAN diubah menjadi 0 di sini).
    const first = d.parts[0].generation.items[0];
    (first as { unitPrice: unknown }).unitPrice = null;
    (first as { priceStatus: string }).priceStatus = 'PRICE_UNRESOLVED';

    expect(saveDraft({ draft: d, projectId: PID }).ok).toBe(true);
    const rec = peekPersistedDraft(PID)!;
    expect(rec.unresolvedItems.length).toBeGreaterThan(0);
    expect(rec.priceProvenance.some((p) => p.priceStatus === 'PRICE_UNRESOLVED')).toBe(true);

    setLastUniversalDraft(null);
    const loaded = loadDraft(PID);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) throw new Error('unreachable');
    const restoredFirst = effectiveItems(loaded.draft).find((i) => i.description === first.description)!;
    expect(isPriceValidForTotal(restoredFirst)).toBe(false);

    const payload = buildPushPayload(loaded.draft);
    const payloadFirst = payload.find((p) => p.description === `[Chat AI] ${first.description}`)!;
    expect(payloadFirst.priceStatus).toBe('PRICE_UNRESOLVED');
    expect('unitPrice' in payloadFirst).toBe(false);

    // Simpan lewat factory ASLI + baca-balik dari lapisan persistensi.
    const records = payload.map((p, i) => createRabItemRecord(p as never, PID, { index: i }));
    saveVersioned('ezrab_prod_rab_items', records);
    const back = loadVersioned<RabItem[]>('ezrab_prod_rab_items');
    expect(back.ok).toBe(true);
    if (!back.ok) throw new Error('unreachable');
    const backFirst = back.data.find((r) => r.description === payloadFirst.description)!;
    expect(backFirst.priceStatus).toBe('PRICE_UNRESOLVED');
    // Total finansial dari ENGINE (bukan state UI): unresolved dikecualikan.
    const summary = UnifiedProjectEngine.recalculateCostSummary(back.data);
    const expectedPriced = back.data
      .filter((r) => r.priceStatus !== 'PRICE_UNRESOLVED')
      .reduce((acc, r) => acc + (r.amount || 0), 0);
    expect(summary.directCost).toBe(expectedPriced);
  });
});

/* ================================================================== */
/* §4 — Rantai transfer (simulasi store dengan helper asli)            */
/* ================================================================== */

interface StoreSim {
  projects: Set<string>;
  itemsByProject: Map<string, RabItem[]>;
  registry: FinalizationKeyRegistry;
}

/** Menyusun urutan bulkAddRabItems ASLI: gerbang proyek → duplikat kunci
 *  → factory → catat kunci (hanya sesudah insert sukses) → persist. */
function simBulkAdd(sim: StoreSim, items: unknown[], pid: string, finalizationKey?: string) {
  if (!sim.projects.has(pid)) {
    return { records: [] as RabItem[], outcome: { duplicate: false, projectMissing: true, insertedCount: 0, finalizationKey } };
  }
  if (finalizationKey && isFinalizationKeyApplied(sim.registry, pid, finalizationKey)) {
    return { records: [] as RabItem[], outcome: { duplicate: true, insertedCount: 0, finalizationKey } };
  }
  const records = (items as Array<Record<string, unknown>>).map((it, i) =>
    createRabItemRecord(it as never, pid, { index: i }),
  );
  sim.itemsByProject.set(pid, [...(sim.itemsByProject.get(pid) ?? []), ...records]);
  if (finalizationKey) sim.registry = applyFinalizationKey(sim.registry, pid, finalizationKey);
  // Persist seperti ProjectContext: item + registry lewat hardenedStorage.
  saveVersioned('ezrab_prod_rab_items', [...sim.itemsByProject.values()].flat());
  saveVersioned('ezrab_prod_finalization_keys', sim.registry);
  return { records, outcome: { duplicate: false, insertedCount: records.length, finalizationKey } };
}

describe('§4 verifikasi rantai transfer', () => {
  it('1. penargetan eksplisit: item hanya masuk proyek tujuan', () => {
    const d = draftOf('buatkan RAB drainase U-Ditch sepanjang 500 meter');
    const payload = buildPushPayload(d);
    const sim: StoreSim = { projects: new Set([PID, PID2]), itemsByProject: new Map(), registry: {} };
    const res = simBulkAdd(sim, payload, PID2, buildFinalizationKey(PID2, payload as never));
    expect(res.outcome.insertedCount).toBe(payload.length);
    expect(sim.itemsByProject.get(PID2)?.length).toBe(payload.length);
    expect(sim.itemsByProject.get(PID) ?? []).toHaveLength(0);
    // Kontrak sumber view: insertRabItemsVerified meneruskan projectId
    // eksplisit ke bulkAddRabItems (bukan tebakan proyek aktif store).
    const viewSrc = readFileSync(new URL('../ai-tools/ezrab-ai/view.tsx', import.meta.url), 'utf8');
    expect(viewSrc).toMatch(/bulkAddRabItems\(\s*batch as never,\s*projectId,/);
    expect(viewSrc).toContain('insertRabItemsVerified(newItems, effProject.id, {');
  });

  it('2. receipt mengikat draftId+versi: validateTransfer menolak transfer ulang versi sama ke proyek sama', () => {
    const d = draftOf('buatkan RAB drainase U-Ditch sepanjang 500 meter');
    expect(validateTransfer(d, PID).duplicate).toBe(false);
    const receipt = applyTransferReceipt(d, PID, 5, 1);
    expect(receipt.version).toBe(d.version);
    const v = validateTransfer(d, PID);
    expect(v.duplicate).toBe(true);
    expect(v.allowed).toBe(false);
    // Proyek BERBEDA bukan duplikat (receipt terikat per proyek).
    expect(validateTransfer(d, PID2).duplicate).toBe(false);
    // Binding draftId hidup di record persisten di samping lastTransfer.
    expect(saveDraft({ draft: d, projectId: PID }).ok).toBe(true);
    expect(markTransferred(PID, receipt).ok).toBe(true);
    const rec = peekPersistedDraft(PID)!;
    expect(rec.draftId).toBe(d.id);
    expect(rec.lastTransfer?.version).toBe(d.version);
    expect(rec.draftStatus).toBe('transferred');
    // Sesudah refresh, draft hasil restore tetap dikenali sudah ditransfer.
    setLastUniversalDraft(null);
    const loaded = loadDraft(PID);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(validateTransfer(loaded.draft, PID).duplicate).toBe(true);
  });

  it('3. kunci finalisasi STABIL lintas reload persistensi §2, BERUBAH bila draft direvisi', () => {
    const d = draftOf('Buatkan RAB gedung kantor 3 lantai luas 900 m²');
    const keyBefore = buildFinalizationKey(PID, buildPushPayload(d) as never);
    expect(saveDraft({ draft: d, projectId: PID }).ok).toBe(true);
    setLastUniversalDraft(null);
    const loaded = loadDraft(PID);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) throw new Error('unreachable');
    const keyAfterReload = buildFinalizationKey(PID, buildPushPayload(loaded.draft) as never);
    expect(keyAfterReload).toBe(keyBefore);
    // Retry dengan set item sama (urutan dibalik) → kunci sama.
    const payload = buildPushPayload(loaded.draft);
    expect(buildFinalizationKey(PID, [...payload].reverse() as never)).toBe(keyBefore);
    // Revisi nyata → item berubah → kunci baru (transfer versi baru sah).
    const rev = reviseUniversalDraft(loaded.draft, 'ubah luas menjadi 800 m2');
    expect(rev?.changed).toBe(true);
    const keyRevised = buildFinalizationKey(PID, buildPushPayload(loaded.draft) as never);
    expect(keyRevised).not.toBe(keyBefore);
  });

  it('4. dedupe persisten lintas reload: registry dari storage dingin → submit ulang = duplicate, item tidak bertambah', () => {
    const d = draftOf('buatkan RAB drainase U-Ditch sepanjang 500 meter');
    const payload = buildPushPayload(d);
    const key = buildFinalizationKey(PID, payload as never);
    const sim: StoreSim = { projects: new Set([PID]), itemsByProject: new Map(), registry: {} };
    const first = simBulkAdd(sim, payload, PID, key);
    expect(first.outcome.insertedCount).toBe(payload.length);

    // "Reload": registry + item dibaca ULANG dari storage (bukan memori sim).
    const regBack = loadVersioned<FinalizationKeyRegistry>('ezrab_prod_finalization_keys');
    expect(regBack.ok).toBe(true);
    if (!regBack.ok) throw new Error('unreachable');
    expect(isFinalizationKeyApplied(regBack.data, PID, key)).toBe(true);
    const itemsBack = loadVersioned<RabItem[]>('ezrab_prod_rab_items');
    expect(itemsBack.ok).toBe(true);
    const sim2: StoreSim = {
      projects: new Set([PID]),
      itemsByProject: new Map([[PID, itemsBack.ok ? itemsBack.data : []]]),
      registry: regBack.data,
    };
    const second = simBulkAdd(sim2, payload, PID, key);
    expect(second.outcome.duplicate).toBe(true);
    expect(second.outcome.insertedCount).toBe(0);
    expect(sim2.itemsByProject.get(PID)?.length).toBe(payload.length);
  });

  it('5+8. kegagalan parsial & proyek hilang: outcome akurat, BUKAN sukses penuh; jalur view ter-pin ke SPREADSHEET_PERSISTENCE_UNVERIFIED', () => {
    const sim: StoreSim = { projects: new Set([PID]), itemsByProject: new Map(), registry: {} };
    const missing = simBulkAdd(sim, [{ description: 'X', volume: 1, unit: 'ls' }], 'PRJ-HILANG', 'fin_x');
    expect(missing.outcome.projectMissing).toBe(true);
    expect(missing.outcome.insertedCount).toBe(0);
    // Kunci TIDAK tercatat untuk percobaan gagal → retry tetap sah.
    expect(isFinalizationKeyApplied(sim.registry, 'PRJ-HILANG', 'fin_x')).toBe(false);
    // Kontrak sumber view (Fase F, diverifikasi utuh): mismatch jumlah /
    // projectMissing → SPREADSHEET_PERSISTENCE_UNVERIFIED + pesan parsial
    // dengan hitungan, kwitansi hanya dicatat sesudah verified penuh.
    const viewSrc = readFileSync(new URL('../ai-tools/ezrab-ai/view.tsx', import.meta.url), 'utf8');
    expect(viewSrc).toContain("structuredAiError('SPREADSHEET_PERSISTENCE_UNVERIFIED')");
    expect(viewSrc).toMatch(/outcome\.projectMissing \|\| outcome\.insertedCount !== batch\.length/);
    expect(viewSrc).toContain('Transfer parsial:');
    expect(viewSrc).toMatch(/if \(!res\.verified\)/);
  });

  it('6. baca-balik nyata: jumlah/volume/satuan/provenans cocok; total dari UnifiedProjectEngine atas item baca-balik', () => {
    const d = draftOf('buatkan RAB drainase U-Ditch sepanjang 500 meter');
    const payload = buildPushPayload(d);
    const sim: StoreSim = { projects: new Set([PID]), itemsByProject: new Map(), registry: {} };
    simBulkAdd(sim, payload, PID, buildFinalizationKey(PID, payload as never));
    const back = loadVersioned<RabItem[]>('ezrab_prod_rab_items');
    expect(back.ok).toBe(true);
    if (!back.ok) throw new Error('unreachable');
    expect(back.data.length).toBe(payload.length);
    payload.forEach((p, i) => {
      const r = back.data[i];
      expect(r.description).toBe(p.description);
      expect(r.volume).toBe(p.volume);
      expect(r.unit).toBe(p.unit);
      expect(r.priceSourceKind ?? undefined).toBe(p.priceSourceKind);
      expect(r.priceSourceLabel ?? undefined).toBe(p.priceSourceLabel);
    });
    const summary = UnifiedProjectEngine.recalculateCostSummary(back.data);
    const expected = back.data
      .filter((r) => r.priceStatus !== 'PRICE_UNRESOLVED')
      .reduce((acc, r) => acc + (r.amount || 0), 0);
    expect(summary.directCost).toBe(expected);
    expect(summary.directCost).toBeGreaterThan(0);
  });

  it('7. (kontrak payload) — tercakup di describe provenans: payload unresolved tanpa unitPrice', () => {
    const d = draftOf('buatkan RAB drainase U-Ditch sepanjang 500 meter');
    const payload = buildPushPayload(d);
    for (const p of payload) {
      if (p.priceStatus === 'PRICE_UNRESOLVED') expect('unitPrice' in p).toBe(false);
    }
  });
});

/* ================================================================== */
/* §9 — Performa & integritas                                          */
/* ================================================================== */

describe('§9 performa/integritas', () => {
  it('serialisasi draft besar (300 item): ukuran JSON + waktu save/load terukur', () => {
    const base = draftOf('buatkan RAB drainase U-Ditch sepanjang 500 meter');
    const d = JSON.parse(JSON.stringify(base)) as UniversalDraft;
    // Gandakan parts (id template disuffix agar id item unik) sampai ≥300 item.
    let n = 2;
    while (effectiveItems(d).length < 300) {
      const clone = JSON.parse(JSON.stringify(base.parts)) as UniversalDraft['parts'];
      clone.forEach((p) => { p.template = { ...p.template, id: `${p.template.id}-x${n}` }; });
      d.parts.push(...clone);
      n++;
    }
    const count = effectiveItems(d).length;
    expect(count).toBeGreaterThanOrEqual(300);
    const t0 = Date.now();
    const res = saveDraft({ draft: d, projectId: PID });
    const saveMs = Date.now() - t0;
    expect(res.ok).toBe(true);
    const rawJson = store[AI_DRAFTS_STORAGE_KEY] ?? '';
    const t1 = Date.now();
    const loaded = loadDraft(PID);
    const loadMs = Date.now() - t1;
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(effectiveItems(loaded.draft).length).toBe(count);
    console.log(`[§9] draft ${count} item → record JSON ${(rawJson.length / 1024).toFixed(1)} KiB; save ${saveMs} ms; load ${loadMs} ms`);
    expect(saveMs).toBeLessThan(5000);
    expect(loadMs).toBeLessThan(5000);
  });

  it('budget riwayat 12.000 char tetap efektif walau pesan draft raksasa ada di riwayat', async () => {
    const giant = `Tabel draft RAB universal\n${'x'.repeat(30_000)}`;
    const spy = vi
      .spyOn(aiToolsProviderClient, 'execute')
      .mockResolvedValue({ success: false, message: 'berhenti di tes', errorCode: 'TEST_STOP' } as never);
    const svc = new EzrabAiService();
    await svc.send({
      messages: [
        { role: 'user', content: 'buatkan RAB drainase' },
        { role: 'assistant', content: giant },
        { role: 'assistant', content: giant },
        { role: 'user', content: 'lanjutkan' },
      ],
    } as never);
    const prompt = String((spy.mock.calls[0][0] as { prompt: string }).prompt);
    spy.mockRestore();
    // Batas gateway 20.000 char (api/_lib/security.js) tidak ditembus,
    // dan pemotongan DITANDAI eksplisit (bukan diam-diam).
    expect(prompt.length).toBeLessThan(20_000);
    expect(prompt).toContain('dipotong demi batas konteks');
    // Blok riwayat sendiri: di antara penanda, di bawah budget 12.000 +
    // jatah pesan terakhir 6.000 + label peran.
    const hist = prompt.split('RIWAYAT PERCAKAPAN:')[1]?.split('=== AKHIR DATA ===')[0] ?? '';
    expect(hist.length).toBeLessThan(12_000 + 6_000 + 500);
  });

  it('frekuensi autosave: tepat 1 tulis storage per perubahan draft ter-commit; 0 untuk isi sama', () => {
    const d = draftOf('Buatkan RAB gedung kantor 3 lantai luas 900 m²');
    saveDraft({ draft: d, projectId: PID });
    expect(writeCounts[AI_DRAFTS_STORAGE_KEY]).toBe(1);
    saveDraft({ draft: d, projectId: PID });
    saveDraft({ draft: d, projectId: PID });
    expect(writeCounts[AI_DRAFTS_STORAGE_KEY]).toBe(1);
    const rev = reviseUniversalDraft(d, 'ubah luas menjadi 800 m2');
    expect(rev?.changed).toBe(true);
    saveDraft({ draft: d, projectId: PID });
    expect(writeCounts[AI_DRAFTS_STORAGE_KEY]).toBe(2);
  });

  it('transfer TIDAK mengirim riwayat percakapan ke AI: jalur insert terstruktur lokal (kontrak sumber)', () => {
    const viewSrc = readFileSync(new URL('../ai-tools/ezrab-ai/view.tsx', import.meta.url), 'utf8');
    const start = viewSrc.indexOf('const insertRabItemsVerified');
    const end = viewSrc.indexOf('const pushDirectRabToSpreadsheet');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const slice = viewSrc.slice(start, end);
    expect(slice).toContain('bulkAddRabItems');
    expect(slice).not.toContain('ezrabAiService');
    expect(slice).not.toContain('messages');
    // Payload transfer sendiri murni item terstruktur — tanpa field percakapan.
    const d = draftOf('buatkan RAB drainase U-Ditch sepanjang 500 meter');
    const payload = buildPushPayload(d);
    for (const p of payload) {
      expect(Object.keys(p)).not.toContain('content');
      expect(Object.keys(p)).not.toContain('role');
    }
  });
});

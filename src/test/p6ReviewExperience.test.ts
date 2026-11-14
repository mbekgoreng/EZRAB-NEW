/**
 * P6 FULL REPAIR (2026-11-13) — Pengalaman review pengguna
 * (audit Autonomous Estimation §A.5 + carry-over P3D-O1/O2/O3, P5-O6).
 *
 * Yang dibuktikan suite ini (LOGIKA, bukan sekadar render):
 *  §A Remap AHSP pra-approval: FULL → RESOLVED resmi; PARTIAL →
 *     UNRESOLVED jujur; kode tak dikenal / satuan tak cocok DITOLAK;
 *     harga manual yang menutupi dibersihkan; input tidak dimutasi;
 *     jalur resolver NYATA konsisten dengan lookup-nya.
 *  §B Render chat: kode AHSP di tabel draft + penjelasan sumber harga
 *     di detail item; header tabel (dipin suite lain) tidak berubah.
 *  §C Alur resolve dimensi MISSING: teridentifikasi, diisi dimensi,
 *     kuantitas dihitung ulang lewat qtoBridge, keputusan tercatat +
 *     bertahan; dimensi tak cukup / verdict bukan MISSING ditolak.
 *  §D Review lengkap: edit uraian/spek/volume mengubah state +
 *     bertahan (save/load); harga manual ber-provenance; info hilang
 *     teridentifikasi.
 *  §E Pencatatan keputusan (P5-O2): putusan asumsi mengisi
 *     userDecisionStatus; verifikasi eksplisit mengisi
 *     verificationDate; edit biasa TIDAK mengisinya; payload
 *     transfer membawanya.
 *  §F Threading WBS (P3D-O1): hook auto-attach + persistensi +
 *     fingerprint + dedupe + rebuild revisi dengan previousArtifact
 *     (P3D-O2); P4-(d) byte-identik dipertahankan.
 *  §G Kelengkapan WBS tampil (wbsCompletenessLines).
 *  §H Preset 5 sheet anggota ExportPresetId resmi; cast dihapus.
 *  §I Kontrak-sumber: wiring panel + hook + rebuild revisi.
 *
 * Run: runner shim vitest (lihat shim-p6/run-targeted-p6.sh).
 * Provider nyata: NOT RUN (0 panggilan). Lookup AHSP di §A memakai
 * stub — kecuali A8 yang memakai resolver nyata atas katalog hidup.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import {
  buildUniversalDraft,
  effectiveItems,
  computeTotals,
  formatUniversalDraftMessage,
  buildPushPayload,
  setLastUniversalDraft,
  type UniversalDraft,
} from '../ai-tools/ezrab-ai/universalRab';
import {
  saveDraft,
  loadDraft,
  peekPersistedDraft,
  createTransferApprovalBinding,
  checkTransferApprovalBinding,
} from '../ai-tools/ezrab-ai/draftPersistence';
import {
  buildRevisionPreview,
  activateRevision,
} from '../ai-tools/ezrab-ai/draftRevision';
import {
  editDraftItem,
  setDraftItemManualPrice,
  clearDraftItemManualPrice,
  remapDraftItemAhsp,
  defaultAhspPriceLookup,
  verifyDraftItemPrice,
  decideDraftItemAssumption,
  identifyMissingInfo,
  listMissingDimensionItems,
  resolveMissingDimensions,
  type AhspPriceLookup,
} from '../ai-tools/ezrab-ai/draftReview';
import { checkQtoAgainstUserDimensions } from '../ai-tools/ezrab-ai/qtoBridge';
import {
  attachDedToProject,
  loadDedAttachment,
  saveDedAttachment,
  reconcileDedQto,
} from '../ai-tools/ezrab-ai/dedQtoIntegration';
import { excludeWbsNode } from '../ai-tools/ezrab-ai/wbsArtifact';
import { wbsCompletenessLines } from '../ai-tools/ezrab-ai/universalRab';
import { EXPORT_PRESETS } from '../export/types';
import { officialAhspRepository } from '../data/nationalCostDatabase/officialAhspRepository';

/* ---------------- localStorage shim (pola G1 / P4) ---------------- */
const store: Record<string, string> = {};
const writeCounts: Record<string, number> = {};
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => {
    writeCounts[k] = (writeCounts[k] ?? 0) + 1;
    store[k] = v;
  },
  removeItem: (k: string) => { delete store[k]; },
  clear: () => { for (const k of Object.keys(store)) delete store[k]; },
};

const ROAD_TEXT = 'buatkan RAB jalan beton sepanjang 1 km lebar 4 meter';

const canon = (v: unknown): string => {
  const roundTripped = JSON.parse(JSON.stringify(v)) as unknown;
  const walk = (x: unknown): string => {
    if (x === null || typeof x !== 'object') return JSON.stringify(x) ?? 'null';
    if (Array.isArray(x)) return `[${x.map(walk).join(',')}]`;
    const o = x as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${walk(o[k])}`).join(',')}}`;
  };
  return walk(roundTripped);
};

let pidCounter = 0;
const nextPid = () => `PRJ-P6-${++pidCounter}`;

function draftOf(text: string): UniversalDraft {
  const res = buildUniversalDraft(text);
  expect(res.kind).toBe('draft');
  if (res.kind !== 'draft') throw new Error(`buildUniversalDraft kind=${res.kind}`);
  return res.draft;
}

function firstPricedItem(draft: UniversalDraft) {
  const it = effectiveItems(draft).find((i) => i.unitPrice != null && i.priceStatus !== 'PRICE_UNRESOLVED');
  expect(it).toBeDefined();
  return it!;
}

/** Lookup AHSP stub (tanpa data master): FULL / PARTIAL / tak dikenal / satuan beda. */
const stubLookup: AhspPriceLookup = (code, itemUnit) => {
  if (code === 'STUB-FULL') {
    return { found: true, catalogUnit: itemUnit, pricingStatus: 'FULL', resolvedComponents: 7, totalComponents: 7, unitPrice: 50000 };
  }
  if (code === 'STUB-PART') {
    return { found: true, catalogUnit: itemUnit, pricingStatus: 'PARTIAL', resolvedComponents: 4, totalComponents: 7, unitPrice: null };
  }
  if (code === 'STUB-UNIT') {
    return { found: true, catalogUnit: itemUnit === 'm2' ? 'm3' : 'm2' };
  }
  return { found: false };
};

function dedFixture() {
  const output = {
    jobId: 'JOB-P6',
    fileName: 'ded-p6.pdf',
    projectName: 'Proyek P6',
    projectType: 'gedung',
    mode: 'FULL_AI',
    items: [
      {
        id: 'ded-1', name: 'Galian tanah pondasi', category: 'Pondasi', units: 'm3',
        quantity: null, quantitySource: 'UNRESOLVED', quantityNote: 'dimensi galian belum diketahui',
        unitPrice: null, priceSource: 'UNRESOLVED', sourcePages: [3], provenance: ['DED p.3'],
        stage: 'QUANTITY',
      },
      {
        id: 'ded-2', name: 'Beton sloof', category: 'Struktur', units: 'm3',
        quantity: 10, quantitySource: 'DED', quantityNote: null,
        unitPrice: null, priceSource: 'UNRESOLVED', sourcePages: [4], provenance: ['DED p.4'],
        stage: 'QUANTITY',
      },
    ],
    coverage: { totalItems: 2, itemsWithQuantity: 1, itemsWithPrice: 0, itemsFullyResolved: 0, itemsUnresolved: 1, partial: false },
    partial: false,
  };
  return output as never;
}

beforeEach(() => {
  localStorage.clear();
  for (const k of Object.keys(writeCounts)) delete writeCounts[k];
  setLastUniversalDraft(null);
});

/* ================================================================== */
/* §A Remap AHSP                                                       */
/* ================================================================== */

describe('P6 §A — remap AHSP pra-approval', () => {
  it('A1 FULL → PRICE_RESOLVED + OFFICIAL_AHSP + harga resolver + jumlah dihitung ulang', () => {
    const d = draftOf(ROAD_TEXT);
    const it = firstPricedItem(d);
    const before = canon(d);
    const res = remapDraftItemAhsp(d, it.id, 'STUB-FULL', { priceLookup: stubLookup });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error(res.message);
    expect(res.outcome).toBe('RESOLVED');
    expect(res.unitPrice).toBe(50000);
    const after = effectiveItems(res.draft).find((i) => i.id === it.id)!;
    expect(after.ahspCode).toBe('STUB-FULL');
    expect(after.unitPrice).toBe(50000);
    expect(after.priceStatus).toBe('PRICE_RESOLVED');
    expect(after.priceSourceKind).toBe('OFFICIAL_AHSP');
    expect(after.priceSourceLabel).toBe('Harga Resmi AHSP 2026');
    expect(after.amount).toBe(after.volume * 50000);
    expect(after.ahspMappingStatus).toBe('VERIFIED');
    expect(after.priceSourceExplanation).toContain('STUB-FULL');
    // Input tidak dimutasi (fungsi murni).
    expect(canon(d)).toBe(before);
    // Total berubah konsisten (jumlah baru masuk total).
    expect(computeTotals(res.draft).estimatedTotal).toBeGreaterThan(0);
  });

  it('A2 PARTIAL → PRICE_UNRESOLVED jujur + MAPPED_UNPRICED + penjelasan mencatat harga lama', () => {
    const d = draftOf(ROAD_TEXT);
    const it = firstPricedItem(d);
    const oldPrice = it.unitPrice as number;
    const oldCode = it.ahspCode ?? '(tanpa kode)';
    const res = remapDraftItemAhsp(d, it.id, 'STUB-PART', { priceLookup: stubLookup });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error(res.message);
    expect(res.outcome).toBe('UNPRICED');
    expect(res.unitPrice).toBe(null);
    const after = effectiveItems(res.draft).find((i) => i.id === it.id)!;
    expect(after.ahspCode).toBe('STUB-PART');
    expect(after.unitPrice).toBe(null);
    expect(after.amount).toBe(null);
    expect(after.priceStatus).toBe('PRICE_UNRESOLVED');
    expect(after.priceSourceKind).toBe('UNRESOLVED');
    expect(after.ahspMappingStatus).toBe('MAPPED_UNPRICED');
    expect(after.priceSourceExplanation).toContain('PARTIAL');
    expect(after.priceSourceExplanation).toContain(oldCode);
    // Harga lama tercatat sebagai TEKS, bukan sebagai harga.
    expect(after.priceSourceExplanation).toContain('Rp');
    void oldPrice;
  });

  it('A3 kode tak dikenal → DITOLAK, draft byte-identik', () => {
    const d = draftOf(ROAD_TEXT);
    const it = firstPricedItem(d);
    const before = canon(d);
    const res = remapDraftItemAhsp(d, it.id, 'KODE-TIDAK-ADA', { priceLookup: stubLookup });
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('unreachable');
    expect(res.message).toContain('tidak ditemukan');
    expect(canon(d)).toBe(before);
  });

  it('A4 satuan tak cocok → DITOLAK (UNIT_MISMATCH memblokir), draft utuh', () => {
    const d = draftOf(ROAD_TEXT);
    const it = firstPricedItem(d);
    const before = canon(d);
    const res = remapDraftItemAhsp(d, it.id, 'STUB-UNIT', { priceLookup: stubLookup });
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('unreachable');
    expect(res.message).toContain('UNIT_MISMATCH');
    expect(canon(d)).toBe(before);
  });

  it('A5 kode sama dengan yang dipakai → ditolak sebagai no-op', () => {
    const d = draftOf(ROAD_TEXT);
    const it = effectiveItems(d).find((i) => i.ahspCode);
    expect(it).toBeDefined();
    const res = remapDraftItemAhsp(d, it!.id, it!.ahspCode as string, { priceLookup: stubLookup });
    expect(res.ok).toBe(false);
  });

  it('A6 remap membersihkan harga manual yang menutupi (harga resolver tampil)', () => {
    const d = draftOf(ROAD_TEXT);
    const it = firstPricedItem(d);
    const manual = setDraftItemManualPrice(d, it.id, 999999);
    expect(manual.ok).toBe(true);
    if (!manual.ok) throw new Error(manual.message);
    expect(effectiveItems(manual.draft).find((i) => i.id === it.id)!.unitPrice).toBe(999999);
    const res = remapDraftItemAhsp(manual.draft, it.id, 'STUB-FULL', { priceLookup: stubLookup });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error(res.message);
    const after = effectiveItems(res.draft).find((i) => i.id === it.id)!;
    expect(after.unitPrice).toBe(50000);
    expect(after.priceStatus).toBe('PRICE_RESOLVED');
  });

  it('A7 remap item tak ada → ditolak, tanpa throw', () => {
    const d = draftOf(ROAD_TEXT);
    const res = remapDraftItemAhsp(d, 'TEMPLATE-X::tidak-ada', 'STUB-FULL', { priceLookup: stubLookup });
    expect(res.ok).toBe(false);
  });

  it('A8 resolver NYATA: hasil remap konsisten dengan lookup resolver yang sama', () => {
    // Draft jalan (teks rumah tanpa dimensi gedung menghasilkan
    // needs-spec, bukan draft — lihat draftOf di atas).
    const d = draftOf(ROAD_TEXT);
    const items = effectiveItems(d);
    expect(items.length).toBeGreaterThan(0);
    // Cari satu kode katalog nyata yang satuannya cocok dengan item draft.
    const active = officialAhspRepository.getActiveOfficialAhsp();
    expect(active.length).toBeGreaterThan(0);
    let picked: { code: string; unit: string; itemId: string } | null = null;
    for (const rec of active.slice(0, 400)) {
      const target = items.find((i) => i.unit === rec.unit && i.ahspCode !== rec.code);
      if (target) {
        picked = { code: rec.code, unit: rec.unit, itemId: target.id };
        break;
      }
    }
    expect(picked).not.toBe(null);
    if (!picked) throw new Error('unreachable');
    const lookup = defaultAhspPriceLookup(picked.code, picked.unit);
    expect(lookup.found).toBe(true);
    const res = remapDraftItemAhsp(d, picked.itemId, picked.code);
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error(res.message);
    const after = effectiveItems(res.draft).find((i) => i.id === picked!.itemId)!;
    if (lookup.pricingStatus === 'FULL' && lookup.unitPrice != null) {
      expect(res.outcome).toBe('RESOLVED');
      expect(after.unitPrice).toBe(lookup.unitPrice);
      expect(after.priceStatus).toBe('PRICE_RESOLVED');
      expect(after.priceSourceKind).toBe('OFFICIAL_AHSP');
    } else {
      // Bukan FULL (PARTIAL/MISSING/unit) → UNPRICED jujur, bukan angka tebakan.
      expect(res.outcome).toBe('UNPRICED');
      expect(after.unitPrice).toBe(null);
      expect(after.priceStatus).toBe('PRICE_UNRESOLVED');
    }
  });
});

/* ================================================================== */
/* §B Render chat                                                      */
/* ================================================================== */

describe('P6 §B — render kode AHSP + penjelasan harga di chat', () => {
  it('B1 tabel draft memuat kode AHSP tiap item berkode', () => {
    const d = draftOf(ROAD_TEXT);
    const msg = formatUniversalDraftMessage(d);
    const coded = effectiveItems(d).filter((i) => i.ahspCode);
    expect(coded.length).toBeGreaterThan(0);
    for (const it of coded.slice(0, 3)) {
      expect(msg).toContain(`(AHSP: ${it.ahspCode})`);
    }
  });

  it('B2 penjelasan sumber harga dirender di detail item (bukan hanya di data)', () => {
    const d = draftOf(ROAD_TEXT);
    const it = firstPricedItem(d);
    // Set penjelasan khas pada salinan agar deterministik.
    const copy = JSON.parse(JSON.stringify(d)) as UniversalDraft;
    const part = copy.parts.find((p) => p.template.id === it.id.split('::')[0])!;
    const gen = part.generation.items.find((g) => `${part.template.id}::${g.id}` === it.id)!;
    gen.priceSourceExplanation = 'Penjelasan uji P6-B2 yang khas.';
    const msg = formatUniversalDraftMessage(copy);
    expect(msg).toContain('Sumber: Penjelasan uji P6-B2 yang khas.');
  });

  it('B3 header tabel TIDAK berubah (pin suite lain dipertahankan)', () => {
    const d = draftOf(ROAD_TEXT);
    const msg = formatUniversalDraftMessage(d);
    expect(msg).toContain('| No | Uraian | Volume | Satuan | Harga Satuan | Jumlah |');
  });
});

/* ================================================================== */
/* §C Alur MISSING                                                     */
/* ================================================================== */

describe('P6 §C — alur resolve dimensi MISSING', () => {
  function setupMissing() {
    const pid = nextPid();
    const attached = attachDedToProject(pid, dedFixture());
    expect(attached.ok).toBe(true);
    if (!attached.ok || !attached.attachment) throw new Error(attached.message);
    const att = attached.attachment;
    const { checks } = reconcileDedQto(att, {});
    return { pid, att, checks };
  }

  it('C1 item MISSING teridentifikasi jelas (bukan MISMATCH/OK)', () => {
    const { att, checks } = setupMissing();
    const missing = checks.filter((c) => c.verdict === 'MISSING');
    expect(missing.length).toBe(1);
    expect(missing[0].description).toBe('Galian tanah pondasi');
    const proposals = listMissingDimensionItems(att, checks);
    expect(proposals.length).toBe(1);
    expect(proposals[0].itemId).toBe('ded-1');
    expect(proposals[0].id).toBe('missing:ded-1');
  });

  it('C2 dimensi diisi → kuantitas dihitung ulang lewat qtoBridge (L×W×kedalaman)', () => {
    const { att, checks } = setupMissing();
    const res = resolveMissingDimensions(att, 'ded-1', { lengthM: 10, widthM: 2, depthM: 1.5 }, checks);
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error(res.message);
    expect(res.expectedQuantity).toBe(30);
    expect(res.basis).toContain('panjang');
    const item = res.attachment.items.find((i) => i.id === 'ded-1')!;
    expect(item.quantity).toBe(30);
    expect(item.quantitySource).toBe('USER_INPUT');
    expect(item.quantityNote).toContain('MISSING');
    const dec = res.attachment.decisions.find((x) => x.itemId === 'ded-1')!;
    expect(dec.verdict).toBe('MISSING');
    expect(dec.action).toBe('confirmed');
    expect(dec.originalQuantity).toBe(null);
    expect(dec.correctedQuantity).toBe(30);
  });

  it('C3 dimensi tak cukup → DITOLAK jujur, lampiran utuh (kuantitas tidak ditebak)', () => {
    const { att, checks } = setupMissing();
    const before = canon(att);
    const res = resolveMissingDimensions(att, 'ded-1', { lengthM: 10 }, checks);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('unreachable');
    expect(res.message).toContain('belum cukup');
    expect(canon(att)).toBe(before);
  });

  it('C4 verdict bukan MISSING (item berkuantitas) → DITOLAK', () => {
    const { att, checks } = setupMissing();
    const res = resolveMissingDimensions(att, 'ded-2', { lengthM: 10, widthM: 2, depthM: 1 }, checks);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('unreachable');
    expect(res.message).toContain('bukan MISSING');
  });

  it('C5 idempotent: resolve kedua dengan angka sama → alreadyApplied, tanpa duplikasi keputusan', () => {
    const { att, checks } = setupMissing();
    const dims = { lengthM: 10, widthM: 2, depthM: 1.5 };
    const r1 = resolveMissingDimensions(att, 'ded-1', dims, checks);
    expect(r1.ok).toBe(true);
    if (!r1.ok) throw new Error(r1.message);
    const checks2 = checkQtoAgainstUserDimensions(
      [{ description: 'Galian tanah pondasi', quantity: null, unit: 'm3' }],
      dims,
    );
    // Check segar tetap MISSING bila dihitung dari lampiran LAMA; dari
    // lampiran BARU item sudah berkuantitas — simulasikan pemanggil
    // yang memakai checks lama: keputusan yang sama dikenali.
    const r2 = resolveMissingDimensions(r1.attachment, 'ded-1', dims, checks2);
    expect(r2.ok).toBe(true);
    if (!r2.ok) throw new Error(r2.message);
    expect(r2.alreadyApplied).toBe(true);
    expect(r2.attachment.decisions.filter((x) => x.itemId === 'ded-1').length).toBe(1);
  });

  it('C6 dimensi tidak valid (0 / negatif) → DITOLAK', () => {
    const { att, checks } = setupMissing();
    const r1 = resolveMissingDimensions(att, 'ded-1', { lengthM: 0, widthM: 2, depthM: 1 }, checks);
    expect(r1.ok).toBe(false);
    const r2 = resolveMissingDimensions(att, 'ded-1', { lengthM: -5, widthM: 2, depthM: 1 }, checks);
    expect(r2.ok).toBe(false);
    const r3 = resolveMissingDimensions(att, 'ded-1', {}, checks);
    expect(r3.ok).toBe(false);
  });

  it('C7 hasil resolve BERTAHAN (save/load lampiran)', () => {
    const { pid, att, checks } = setupMissing();
    const res = resolveMissingDimensions(att, 'ded-1', { lengthM: 10, widthM: 2, depthM: 1.5 }, checks);
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error(res.message);
    expect(saveDedAttachment(res.attachment)).toBe(true);
    const reloaded = loadDedAttachment(pid)!;
    expect(reloaded.items.find((i) => i.id === 'ded-1')!.quantity).toBe(30);
    expect(reloaded.decisions.length).toBe(1);
    expect(reloaded.decisions[0].verdict).toBe('MISSING');
  });
});

/* ================================================================== */
/* §D Review lengkap — edit + manual + info hilang                     */
/* ================================================================== */

describe('P6 §D — review lengkap: edit item + harga manual', () => {
  it('D1 edit uraian mengubah state; input tidak dimutasi; changes tercatat', () => {
    const d = draftOf(ROAD_TEXT);
    const it = firstPricedItem(d);
    const before = canon(d);
    const res = editDraftItem(d, it.id, { description: 'Uraian hasil review P6' });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error(res.message);
    expect(effectiveItems(res.draft).find((i) => i.id === it.id)!.description).toBe('Uraian hasil review P6');
    expect(res.draft.changes.some((c) => c.includes('Uraian hasil review P6'))).toBe(true);
    expect(canon(d)).toBe(before);
  });

  it('D2 edit volume menghitung ulang jumlah (volume × harga)', () => {
    const d = draftOf(ROAD_TEXT);
    const it = firstPricedItem(d);
    const res = editDraftItem(d, it.id, { volume: it.volume * 2 });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error(res.message);
    const after = effectiveItems(res.draft).find((i) => i.id === it.id)!;
    expect(after.volume).toBe(it.volume * 2);
    expect(after.amount).toBe(it.volume * 2 * (it.unitPrice as number));
  });

  it('D3 volume tidak valid (0/negatif/NaN) → DITOLAK, draft utuh', () => {
    const d = draftOf(ROAD_TEXT);
    const it = firstPricedItem(d);
    const before = canon(d);
    for (const v of [0, -3, Number.NaN]) {
      const res = editDraftItem(d, it.id, { volume: v });
      expect(res.ok).toBe(false);
    }
    expect(canon(d)).toBe(before);
  });

  it('D4 edit uraian MEMINDAHKAN harga manual (tidak hilang senyap)', () => {
    const d = draftOf(ROAD_TEXT);
    const it = firstPricedItem(d);
    const manual = setDraftItemManualPrice(d, it.id, 123456);
    expect(manual.ok).toBe(true);
    if (!manual.ok) throw new Error(manual.message);
    const edited = editDraftItem(manual.draft, it.id, { description: 'Uraian baru sesudah manual' });
    expect(edited.ok).toBe(true);
    if (!edited.ok) throw new Error(edited.message);
    const after = effectiveItems(edited.draft).find((i) => i.id === it.id)!;
    expect(after.unitPrice).toBe(123456);
    expect(after.priceStatus).toBe('PRICE_MANUAL');
  });

  it('D5 harga manual → PRICE_MANUAL + NEEDS_VERIFICATION; hapus → kembali ke generasi', () => {
    const d = draftOf(ROAD_TEXT);
    const it = firstPricedItem(d);
    const res = setDraftItemManualPrice(d, it.id, 777000, 'Survei toko P6');
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error(res.message);
    const after = effectiveItems(res.draft).find((i) => i.id === it.id)!;
    expect(after.unitPrice).toBe(777000);
    expect(after.priceStatus).toBe('PRICE_MANUAL');
    expect(after.priceSourceLabel).toBe('Harga manual pengguna');
    expect(after.priceSourceExplanation).toBe('Survei toko P6');
    expect(after.verificationStatus).toBe('NEEDS_VERIFICATION');
    const cleared = clearDraftItemManualPrice(res.draft, it.id);
    expect(cleared.ok).toBe(true);
    if (!cleared.ok) throw new Error(cleared.message);
    const back = effectiveItems(cleared.draft).find((i) => i.id === it.id)!;
    expect(back.unitPrice).toBe(it.unitPrice);
    expect(back.priceStatus).toBe(it.priceStatus);
  });

  it('D6 harga manual negatif / NaN → DITOLAK', () => {
    const d = draftOf(ROAD_TEXT);
    const it = firstPricedItem(d);
    expect(setDraftItemManualPrice(d, it.id, -1).ok).toBe(false);
    expect(setDraftItemManualPrice(d, it.id, Number.NaN).ok).toBe(false);
  });

  it('D7 edit BERTAHAN: saveDraft → loadDraft (uraian + volume + manual)', () => {
    const pid = nextPid();
    const d = draftOf(ROAD_TEXT);
    const it = firstPricedItem(d);
    const edited = editDraftItem(d, it.id, { description: 'Bertahan sesudah simpan', volume: 42 });
    expect(edited.ok).toBe(true);
    if (!edited.ok) throw new Error(edited.message);
    const manual = setDraftItemManualPrice(edited.draft, it.id, 555000);
    expect(manual.ok).toBe(true);
    if (!manual.ok) throw new Error(manual.message);
    setLastUniversalDraft(manual.draft, pid);
    const saved = saveDraft({ draft: manual.draft, projectId: pid });
    expect(saved.ok).toBe(true);
    const loaded = loadDraft(pid);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) throw new Error(loaded.message);
    const back = effectiveItems(loaded.draft).find((i) => i.id === it.id)!;
    expect(back.description).toBe('Bertahan sesudah simpan');
    expect(back.volume).toBe(42);
    expect(back.unitPrice).toBe(555000);
    expect(back.priceStatus).toBe('PRICE_MANUAL');
  });

  it('D8 identifyMissingInfo menghitung info hilang dari data (bukan karangan)', () => {
    const d = draftOf(ROAD_TEXT);
    const s = identifyMissingInfo(d);
    const items = effectiveItems(d);
    expect(s.unpriced.length).toBe(items.filter((i) => i.unitPrice == null || i.priceStatus === 'PRICE_UNRESOLVED').length);
    expect(s.needsMapping.length).toBe(items.filter((i) => i.ahspMappingStatus === 'NEEDS_MAPPING').length);
    expect(s.totalIssues).toBeGreaterThanOrEqual(s.unpriced.length + s.needsMapping.length);
  });
});

/* ================================================================== */
/* §E Pencatatan keputusan (P5-O2)                                     */
/* ================================================================== */

describe('P6 §E — pencatatan keputusan user', () => {
  /** Item ber-asumsi sintetis (engine template tidak mengeluarkan PRICE_ESTIMATED). */
  function draftWithEstimated(): { draft: UniversalDraft; itemId: string } {
    const d = draftOf(ROAD_TEXT);
    const it = firstPricedItem(d);
    const copy = JSON.parse(JSON.stringify(d)) as UniversalDraft;
    const part = copy.parts.find((p) => p.template.id === it.id.split('::')[0])!;
    const gen = part.generation.items.find((g) => `${part.template.id}::${g.id}` === it.id)!;
    gen.priceStatus = 'PRICE_ESTIMATED';
    gen.priceSourceKind = 'EZRAB_ASSUMPTION';
    gen.priceSourceLabel = 'Estimasi AI';
    return { draft: copy, itemId: it.id };
  }

  it('E1 putusan asumsi mengisi userDecisionStatus; verifikasi mengisi verificationDate', () => {
    const { draft, itemId } = draftWithEstimated();
    const decided = decideDraftItemAssumption(draft, itemId, 'DISETUJUI');
    expect(decided.ok).toBe(true);
    if (!decided.ok) throw new Error(decided.message);
    const afterDecide = effectiveItems(decided.draft).find((i) => i.id === itemId)!;
    expect(afterDecide.userDecisionStatus).toBe('DISETUJUI');
    expect(afterDecide.verificationDate).toBeUndefined();
    const verified = verifyDraftItemPrice(decided.draft, itemId, { at: '2026-11-13T10:00:00.000Z' });
    expect(verified.ok).toBe(true);
    if (!verified.ok) throw new Error(verified.message);
    const afterVerify = effectiveItems(verified.draft).find((i) => i.id === itemId)!;
    expect(afterVerify.verificationDate).toBe('2026-11-13T10:00:00.000Z');
    expect(afterVerify.verificationStatus).toBe('VERIFIED');
    // Verifikasi TIDAK mengubah putusan asumsi (sumbu berbeda).
    expect(afterVerify.userDecisionStatus).toBe('DISETUJUI');
  });

  it('E2 putusan atas item TANPA asumsi → DITOLAK (tidak ada yang diputuskan)', () => {
    const d = draftOf(ROAD_TEXT);
    const it = effectiveItems(d).find(
      (i) => i.priceStatus !== 'PRICE_ESTIMATED' && i.priceSourceKind !== 'EZRAB_ASSUMPTION',
    )!;
    const res = decideDraftItemAssumption(d, it.id, 'DISETUJUI');
    expect(res.ok).toBe(false);
  });

  it('E3 verifikasi item TANPA harga → DITOLAK (tidak ada yang diverifikasi)', () => {
    const d = draftOf(ROAD_TEXT);
    const unpriced = effectiveItems(d).find((i) => i.unitPrice == null || i.priceStatus === 'PRICE_UNRESOLVED');
    if (!unpriced) {
      // Draft jalan test ini berharga penuh — buat tak-berharga sintetis.
      const copy = JSON.parse(JSON.stringify(d)) as UniversalDraft;
      copy.parts[0].generation.items[0].unitPrice = null;
      copy.parts[0].generation.items[0].priceStatus = 'PRICE_UNRESOLVED';
      const id = `${copy.parts[0].template.id}::${copy.parts[0].generation.items[0].id}`;
      expect(verifyDraftItemPrice(copy, id).ok).toBe(false);
      return;
    }
    expect(verifyDraftItemPrice(d, unpriced.id).ok).toBe(false);
  });

  it('E4 edit biasa + harga manual TIDAK mengisi verificationDate', () => {
    const d = draftOf(ROAD_TEXT);
    const it = firstPricedItem(d);
    const edited = editDraftItem(d, it.id, { description: 'Edit biasa P6-E4' });
    expect(edited.ok).toBe(true);
    if (!edited.ok) throw new Error(edited.message);
    const manual = setDraftItemManualPrice(edited.draft, it.id, 1000);
    expect(manual.ok).toBe(true);
    if (!manual.ok) throw new Error(manual.message);
    const after = effectiveItems(manual.draft).find((i) => i.id === it.id)!;
    expect(after.verificationDate).toBeUndefined();
    expect(after.userDecisionStatus).toBeUndefined();
  });

  it('E5 buildPushPayload membawa verificationDate + userDecisionStatus', () => {
    const { draft, itemId } = draftWithEstimated();
    const decided = decideDraftItemAssumption(draft, itemId, 'DITOLAK');
    expect(decided.ok).toBe(true);
    if (!decided.ok) throw new Error(decided.message);
    const verified = verifyDraftItemPrice(decided.draft, itemId, { at: '2026-11-13T11:00:00.000Z' });
    expect(verified.ok).toBe(true);
    if (!verified.ok) throw new Error(verified.message);
    const payload = buildPushPayload(verified.draft);
    const itemDesc = effectiveItems(verified.draft).find((i) => i.id === itemId)!.description;
    // Payload mengawali uraian dengan '[Chat AI] ' — cocokkan lewat
    // putusan (unik di draft ini) + akhir uraian.
    const row = payload.find((p) => p.userDecisionStatus === 'DITOLAK');
    expect(row).toBeDefined();
    expect(row!.description.endsWith(itemDesc)).toBe(true);
    expect(row!.userDecisionStatus).toBe('DITOLAK');
    expect(row!.verificationDate).toBe('2026-11-13T11:00:00.000Z');
  });

  it('E6 keputusan BERTAHAN (save/load)', () => {
    const pid = nextPid();
    const { draft, itemId } = draftWithEstimated();
    const decided = decideDraftItemAssumption(draft, itemId, 'PERLU_REVISI');
    expect(decided.ok).toBe(true);
    if (!decided.ok) throw new Error(decided.message);
    const verified = verifyDraftItemPrice(decided.draft, itemId, { at: '2026-11-13T12:00:00.000Z' });
    expect(verified.ok).toBe(true);
    if (!verified.ok) throw new Error(verified.message);
    setLastUniversalDraft(verified.draft, pid);
    expect(saveDraft({ draft: verified.draft, projectId: pid }).ok).toBe(true);
    const loaded = loadDraft(pid);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) throw new Error(loaded.message);
    const back = effectiveItems(loaded.draft).find((i) => i.id === itemId)!;
    expect(back.userDecisionStatus).toBe('PERLU_REVISI');
    expect(back.verificationDate).toBe('2026-11-13T12:00:00.000Z');
  });
});

/* ================================================================== */
/* §F Threading WBS (P3D-O1) + rebuild revisi (P3D-O2)                 */
/* ================================================================== */

describe('P6 §F — threading artefak WBS + hook auto-attach', () => {
  it('F1 buildUniversalDraft memasang wbsArtifact + wbsCompleteness', () => {
    const d = draftOf(ROAD_TEXT);
    expect(d.wbsArtifact).toBeDefined();
    expect(d.wbsCompleteness).toBeDefined();
    expect(d.wbsArtifact!.nodes.some((n) => n.id === 'wbs:jalan')).toBe(true);
    expect(['LENGKAP', 'BELUM_LENGKAP']).toContain(d.wbsCompleteness!.status);
  });

  it('F2 save → load mempertahankan kedua field WBS (canon identik)', () => {
    const pid = nextPid();
    const d = draftOf(ROAD_TEXT);
    setLastUniversalDraft(d, pid);
    expect(saveDraft({ draft: d, projectId: pid }).ok).toBe(true);
    const loaded = loadDraft(pid);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) throw new Error(loaded.message);
    expect(canon(loaded.draft.wbsArtifact)).toBe(canon(d.wbsArtifact));
    expect(canon(loaded.draft.wbsCompleteness)).toBe(canon(d.wbsCompleteness));
    // Seluruh draft round-trip identik (syarat P4-(d)).
    expect(canon(loaded.draft)).toBe(canon(d));
  });

  it('F3 dedupe autosave: simpan ulang identik → deduplicated; artefak berubah → ditulis', () => {
    const pid = nextPid();
    const d = draftOf(ROAD_TEXT);
    setLastUniversalDraft(d, pid);
    const s1 = saveDraft({ draft: d, projectId: pid });
    expect(s1.ok).toBe(true);
    const writesAfterFirst = writeCounts['ezrab_prod_ai_drafts'] ?? 0;
    const s2 = saveDraft({ draft: d, projectId: pid });
    expect(s2.ok).toBe(true);
    if (!s2.ok) throw new Error('unreachable');
    expect(s2.deduplicated).toBe(true);
    expect(writeCounts['ezrab_prod_ai_drafts'] ?? 0).toBe(writesAfterFirst);
    // Ubah artefak SAJA (keputusan review WBS) — harus ditulis.
    const changed = JSON.parse(JSON.stringify(d)) as UniversalDraft;
    changed.wbsArtifact = excludeWbsNode(changed.wbsArtifact!, 'wbs:jalan', 'Tidak dikerjakan — keputusan review P6');
    const s3 = saveDraft({ draft: changed, projectId: pid });
    expect(s3.ok).toBe(true);
    if (!s3.ok) throw new Error('unreachable');
    expect(s3.deduplicated).toBe(false);
    const loaded = loadDraft(pid);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) throw new Error(loaded.message);
    const node = loaded.draft.wbsArtifact!.nodes.find((n) => n.id === 'wbs:jalan');
    expect(node?.status).toBe('DIKECUALIKAN');
  });

  it('F4 P4-(d): seed v1 byte-identik sesudah aktivasi (dengan field WBS terpasang)', () => {
    const pid = nextPid();
    const d = draftOf('buatkan RAB Gedung A 3 lantai 15 x 10 m + Gedung B 2 lantai 12 x 8 m, plus jalan akses sepanjang 50 m');
    setLastUniversalDraft(d, pid);
    expect(saveDraft({ draft: d, projectId: pid }).ok).toBe(true);
    const v1Canon = canon(d);
    const out = buildRevisionPreview(d, 'gedung B jadi 3 lantai', pid);
    expect(out.kind).toBe('preview');
    if (out.kind !== 'preview') throw new Error(`kind=${out.kind}`);
    const res = activateRevision(pid, out.preview);
    expect(res.ok).toBe(true);
    const rec = peekPersistedDraft(pid)!;
    const seed = rec.versionHistory!.find((h) => h.version === 1)!;
    expect(canon(seed.draft)).toBe(v1Canon);
    // Seed membawa artefak WBS (bukan dibuang persistence).
    expect(seed.draft.wbsArtifact).toBeDefined();
  });

  it('F5 revisi membangun ulang artefak dengan previousArtifact (pengecualian user bertahan — P3D-O2)', () => {
    const pid = nextPid();
    // Teks + permintaan revisi P4 (parser revisi mengenali perubahan
    // lantai gedung; permintaan lebar jalan tidak dikenali).
    const d = draftOf('buatkan RAB Gedung A 3 lantai 15 x 10 m + Gedung B 2 lantai 12 x 8 m, plus jalan akses sepanjang 50 m');
    // Kecualikan node pertama artefak sebagai keputusan user pada v1.
    const nodeId = d.wbsArtifact!.nodes[0].id;
    d.wbsArtifact = excludeWbsNode(d.wbsArtifact!, nodeId, 'Node tidak dikerjakan — keputusan user P6');
    setLastUniversalDraft(d, pid);
    expect(saveDraft({ draft: d, projectId: pid }).ok).toBe(true);
    const out = buildRevisionPreview(d, 'gedung B jadi 3 lantai', pid);
    expect(out.kind).toBe('preview');
    if (out.kind !== 'preview') throw new Error(`kind=${out.kind}`);
    const node = out.preview.candidate.wbsArtifact!.nodes.find((n) => n.id === nodeId);
    expect(node).toBeDefined();
    expect(node!.status).toBe('DIKECUALIKAN');
    expect(node!.exclusion?.by).toBe('user');
    expect(out.preview.candidate.wbsCompleteness).toBeDefined();
  });

  it('F6 binding approval G1 tetap berlaku dengan field WBS terpasang', () => {
    const pid = nextPid();
    const d = draftOf(ROAD_TEXT);
    const binding = createTransferApprovalBinding(d, pid, 1_000_000);
    expect(checkTransferApprovalBinding(binding, d, pid, 1_000_000 + 60_000).ok).toBe(true);
    // Edit review menginvalidasi binding (sidik berubah — benar).
    const it = firstPricedItem(d);
    const edited = editDraftItem(d, it.id, { description: 'Edit membatalkan approval P6-F6' });
    expect(edited.ok).toBe(true);
    if (!edited.ok) throw new Error(edited.message);
    const check = checkTransferApprovalBinding(binding, edited.draft, pid, 1_000_000 + 60_000);
    expect(check.ok).toBe(false);
    if (check.ok) throw new Error('unreachable');
    expect(check.reason).toBe('DRAFT_CHANGED');
  });
});

/* ================================================================== */
/* §G Kelengkapan WBS + §H Preset + §I Kontrak-sumber                  */
/* ================================================================== */

describe('P6 §G/§H/§I — kelengkapan WBS, preset ekspor, kontrak sumber', () => {
  it('G1 wbsCompletenessLines memberi baris status untuk panel review', () => {
    const d = draftOf(ROAD_TEXT);
    const lines = wbsCompletenessLines(d);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0]).toContain('Kelengkapan WBS:');
  });

  it('H1 FIVE_SHEET_RAB anggota EXPORT_PRESETS resmi (sheets [] — tidak memakai kunci 16-sheet)', () => {
    const meta = (EXPORT_PRESETS as Record<string, { sheets: string[]; name: string }>).FIVE_SHEET_RAB;
    expect(meta).toBeDefined();
    expect(meta.sheets).toEqual([]);
    expect(meta.name).toContain('5 Sheet');
  });

  it('H2 cast preset 5 sheet SUDAH dihapus dari mesin + modal', () => {
    const engine = readFileSync(new URL('../export/excelExportEngine.ts', import.meta.url), 'utf8');
    expect(engine).not.toContain('(preset as string)');
    expect(engine).not.toContain('(options as any).preset');
    expect(engine).toContain('preset === FIVE_SHEET_PRESET_ID');
    const modal = readFileSync(
      new URL('../components/export/ExportProjectPackageModal.tsx', import.meta.url),
      'utf8',
    );
    expect(modal).not.toContain('as ExportPackageOptions)');
    expect(modal).toContain('preset: FIVE_SHEET_PRESET_ID');
    const types = readFileSync(new URL('../export/types.ts', import.meta.url), 'utf8');
    expect(types).toContain("'FIVE_SHEET_RAB'");
  });

  it('I1 view.tsx me-wire panel Review draft (menu + render + handler persist)', () => {
    const view = readFileSync(new URL('../ai-tools/ezrab-ai/view.tsx', import.meta.url), 'utf8');
    expect(view).toContain('DraftReviewPanel');
    expect(view).toContain('Review draft');
    expect(view).toContain('openReviewPanel');
    expect(view).toContain('handleApplyReviewDraft');
    expect(view).toContain('handleResolveMissingFromPanel');
    expect(view).toContain("persistActiveDraft('review-edit'");
  });

  it('I2 buildUniversalDraft memasang hook WBS; makePreview membangun ulang dengan previousArtifact', () => {
    const rab = readFileSync(new URL('../ai-tools/ezrab-ai/universalRab.ts', import.meta.url), 'utf8');
    expect(rab).toContain('rebuildWbsAttachment(draft)');
    expect(rab).toContain('export function rebuildWbsAttachment');
    const rev = readFileSync(new URL('../ai-tools/ezrab-ai/draftRevision.ts', import.meta.url), 'utf8');
    expect(rev).toContain('rebuildWbsAttachment(candidate, active.wbsArtifact');
    // Guard P4 tidak dilemahkan (tetap di dalam activateRevision).
    expect(rev).toContain("error: 'DRAFT_NOT_READY'");
    expect(rev).toContain('draftReadiness(preview.candidate)');
  });

  it('I3 panel review membawa aksi-aksi wajib (remap, manual, verifikasi, putusan, MISSING, banding)', () => {
    const panel = readFileSync(new URL('../ai-tools/ezrab-ai/DraftReviewPanel.tsx', import.meta.url), 'utf8');
    expect(panel).toContain('remapDraftItemAhsp');
    expect(panel).toContain('setDraftItemManualPrice');
    expect(panel).toContain('verifyDraftItemPrice');
    expect(panel).toContain('decideDraftItemAssumption');
    expect(panel).toContain('listMissingDimensionItems');
    expect(panel).toContain('wbsCompletenessLines');
    expect(panel).toContain('onCompareVersions');
    expect(panel).toContain('onActivateRevision');
  });
});

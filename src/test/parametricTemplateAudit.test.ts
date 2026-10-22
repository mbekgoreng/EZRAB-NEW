/**
 * parametricTemplateAudit.test.ts — Audit menyeluruh template parametrik
 * jalur spek bebas/direct (WS-1, Fase B lanjutan remediasi integritas):
 *
 * B.2  Audit semua template (rumah T36/T45/T70 1 lantai, T36 2 lantai,
 *      ruko 2 lantai, jalan beton, drainase U-Ditch): volume valid
 *      (finite, >= 0), tidak ada item duplikat, rantai subtotal ->
 *      overhead 5% -> profit 5% -> pajak 11% konsisten, status total
 *      konsisten dengan harga item.
 * B.3  Kandidat pemetaan benchmark: 4 diterapkan karena identitas +
 *      spesifikasi + satuan TERBUKTI sama (bouwplank, keramik 40x40,
 *      rangka atap, genteng metal); 2 DITOLAK (plesteran 1:4 vs 1:5;
 *      kloset jongkok/duduk standar vs duduk monoblok) dan tetap
 *      PRICE_UNAVAILABLE. Semua harga hasil pemetaan adalah tier
 *      BENCHMARK (indikatif), BUKAN harga AHSP resmi.
 * B.4a Luas kamar mandi dibaca dari data spaces template aktif
 *      (S6a): T36 = 2,25 m² (tetap), T45/T70 = 3,0 m² (terkoreksi);
 *      invarian lantai: qty(07.02) + qty(07.03) == luas bangunan
 *      (tidak ada bidang lantai yang hilang atau terhitung ganda).
 * B.4b Konstanta tetap template (kusen 37,5 m', titik kolom 12, titik
 *      lampu 8, titik stop kontak 6) dinyatakan eksplisit sebagai
 *      parameter yang BELUM diskalakan (blocker FORMULA_UNVERIFIED S6).
 * B.5  Label status per item selalu anggota kontrak ItemPriceStatus.
 */
import { describe, it, expect } from 'vitest';
import { parametricVolumeEngine } from '../engine/parametricVolumeEngine/parametricVolumeEngine';
import type { ItemPriceStatus, TemplateGenerationResult } from '../data/buildingTemplates/schema/types';

const ALL_TEMPLATE_IDS = [
  'template-house-type-36-single-floor',
  'template-house-type-45-single-floor',
  'template-house-type-70-single-floor',
  'template-house-type-36-two-floor',
  'template-shophouse-2-floor',
  'template-concrete-road-rigid-pavement',
  'template-uditch-drainage',
] as const;

/** Parameter batas wajar (besar tetapi masuk akal) per template. */
const BOUNDARY_PARAMS: Record<string, Record<string, any>> = {
  'template-house-type-36-single-floor': { buildingArea: 120, buildingWidth: 10, buildingLength: 12, bedroomCount: 3, bathroomCount: 2 },
  'template-house-type-45-single-floor': { buildingArea: 120, buildingWidth: 10, buildingLength: 12, bedroomCount: 3, bathroomCount: 2 },
  'template-house-type-70-single-floor': { buildingArea: 140, buildingWidth: 10, buildingLength: 14, bedroomCount: 3, bathroomCount: 2 },
  'template-house-type-36-two-floor': { buildingArea: 130, groundFloorArea: 65, upperFloorArea: 65, buildingWidth: 8, buildingLength: 9, bedroomCount: 3, bathroomCount: 2 },
  'template-shophouse-2-floor': { buildingArea: 160, buildingWidth: 5, buildingLength: 16 },
  'template-concrete-road-rigid-pavement': { roadLength: 1000, roadWidth: 7, slabThickness: 0.25 },
  'template-uditch-drainage': { drainageLength: 250, uDitchWidth: 0.6, uDitchHeight: 0.6 },
};

const VALID_PRICE_STATUSES: readonly ItemPriceStatus[] = [
  'OFFICIAL',
  'BENCHMARK',
  'UNIT_MISMATCH',
  'AHSP_UNRESOLVED',
  'PRICE_UNAVAILABLE',
];

function auditResult(id: string, r: TemplateGenerationResult) {
  // Tidak ada error perhitungan pada parameter wajar.
  expect(r.errors, `${id} errors`).toEqual([]);
  expect(r.workItems.length, `${id} item count`).toBeGreaterThan(0);

  const seenKeys = new Set<string>();
  const seenIds = new Set<string>();
  for (const w of r.workItems) {
    // Volume: finite, tidak negatif.
    expect(Number.isFinite(w.quantity), `${id}/${w.wbsCode} finite`).toBe(true);
    expect(w.quantity, `${id}/${w.wbsCode} >= 0`).toBeGreaterThanOrEqual(0);
    expect(w.totalPrice, `${id}/${w.wbsCode} total >= 0`).toBeGreaterThanOrEqual(0);
    // Tidak ada duplikat item (kode AHSP + nama) maupun identitas ganda.
    const key = `${w.ahspCode}|${w.name}`;
    expect(seenKeys.has(key), `${id} duplikat ${key}`).toBe(false);
    seenKeys.add(key);
    expect(seenIds.has(w.workItemId), `${id} workItemId ganda ${w.workItemId}`).toBe(false);
    seenIds.add(w.workItemId);
    // B.5: label status selalu anggota kontrak.
    expect(VALID_PRICE_STATUSES, `${id}/${w.wbsCode} priceStatus`).toContain(w.priceStatus);
    // Konsistensi harga: berharga -> positif & konsisten; tak berharga -> 0.
    if (w.priceStatus === 'OFFICIAL' || w.priceStatus === 'BENCHMARK') {
      expect(w.unitPrice, `${id}/${w.wbsCode}`).toBeGreaterThan(0);
      expect(w.totalPrice, `${id}/${w.wbsCode}`).toBe(Math.round(w.quantity * w.unitPrice));
    } else {
      expect(w.unitPrice, `${id}/${w.wbsCode}`).toBe(0);
      expect(w.totalPrice, `${id}/${w.wbsCode}`).toBe(0);
    }
  }

  // Rantai total: Sigma item == biaya langsung == Sigma subtotal kategori.
  const sumItems = r.workItems.reduce((s, w) => s + w.totalPrice, 0);
  expect(Math.abs(sumItems - r.totalDirectCost), `${id} sigma == direct`).toBeLessThan(1);
  const sumCats = Object.values(r.categorySubtotals).reduce((s, v) => s + v, 0);
  expect(Math.abs(sumCats - r.totalDirectCost), `${id} sigma kategori == direct`).toBeLessThan(1);

  // Rantai overhead -> profit -> pajak terdeklarasi & konsisten.
  expect(r.overheadPercentage, `${id} overhead %`).toBe(5);
  expect(r.profitPercentage, `${id} profit %`).toBe(5);
  expect(r.taxPercentage, `${id} pajak %`).toBe(11);
  const overhead = Math.round((r.totalDirectCost * r.overheadPercentage) / 100);
  const profit = Math.round((r.totalDirectCost * r.profitPercentage) / 100);
  const subtotal = r.totalDirectCost + overhead + profit;
  const tax = Math.round((subtotal * r.taxPercentage) / 100);
  expect(r.overheadAmount, `${id} overhead`).toBe(overhead);
  expect(r.profitAmount, `${id} profit`).toBe(profit);
  expect(r.taxAmount, `${id} pajak`).toBe(tax);
  expect(r.totalRabCost, `${id} total RAB`).toBe(subtotal + tax);

  // Status total konsisten dengan kelengkapan harga.
  if ((r.unpricedItemCount ?? 0) > 0) {
    expect(r.totalStatus, `${id} status`).toBe('INCOMPLETE');
    expect(r.isReadyForSpreadsheet, `${id} ready`).toBe(false);
    expect(r.verifiedTotalRabCost, `${id} verified ditahan`).toBeUndefined();
  }
  expect(r.unpricedItems).toHaveLength(r.unpricedItemCount ?? 0);
}

describe('B.2 — audit semua template parametrik jalur spek bebas/direct', () => {
  it('parameter default: semua template lolos audit volume/duplikat/total/status', () => {
    for (const id of ALL_TEMPLATE_IDS) {
      const r = parametricVolumeEngine.generateRABFromTemplate({ templateId: id, parameters: {}, region: 'DKI Jakarta' });
      auditResult(id, r);
    }
  });

  it('parameter batas wajar: semua template lolos audit yang sama', () => {
    for (const id of ALL_TEMPLATE_IDS) {
      const r = parametricVolumeEngine.generateRABFromTemplate({
        templateId: id,
        parameters: BOUNDARY_PARAMS[id],
        region: 'DKI Jakarta',
      });
      auditResult(`${id}@batas`, r);
    }
  });

  it('jalan beton: seluruh harga tetap PRICE_UNAVAILABLE (fallback datar tidak hidup lagi)', () => {
    const r = parametricVolumeEngine.generateRABFromTemplate({
      templateId: 'template-concrete-road-rigid-pavement',
      parameters: {},
      region: 'DKI Jakarta',
    });
    expect(r.workItems.length).toBeGreaterThan(0);
    expect(r.workItems.every((w) => w.priceStatus === 'PRICE_UNAVAILABLE')).toBe(true);
    expect(r.totalDirectCost).toBe(0);
    expect(r.totalStatus).toBe('INCOMPLETE');
  });

  it('U-Ditch: semua item berharga BENCHMARK, total INDICATIVE (bukan resmi)', () => {
    const r = parametricVolumeEngine.generateRABFromTemplate({
      templateId: 'template-uditch-drainage',
      parameters: {},
      region: 'DKI Jakarta',
    });
    expect(r.unpricedItemCount).toBe(0);
    expect(r.workItems.every((w) => w.priceStatus === 'BENCHMARK')).toBe(true);
    expect(r.totalStatus).toBe('INDICATIVE');
    expect(r.verifiedDirectCost).toBe(0);
  });
});

describe('B.3 — kandidat pemetaan benchmark: diterapkan hanya yang identitasnya terbukti', () => {
  function gen5x10() {
    return parametricVolumeEngine.generateRABFromTemplate({
      templateId: 'template-house-type-45-single-floor',
      parameters: { buildingArea: 50, floorCount: 1, buildingWidth: 5, buildingLength: 10 },
      region: 'DKI Jakarta',
    });
  }

  it('4 pemetaan diterapkan: kode terkoreksi, tier BENCHMARK (bukan OFFICIAL), harga tabel', () => {
    const r = gen5x10();
    const cases: Array<[string, string, number]> = [
      // wbs, kode baru, harga satuan benchmark DKI
      ['01.02', 'A.2.2.1.1', 28500], // bouwplank: frasa pekerjaan sama, satuan m'/m
      ['07.02', 'A.4.4.3.3', 195000], // keramik: entri tarif mencakup 40x40 eksplisit
      ['09.01', 'A.4.5.2.3', 185000], // rangka atap: profil C75/0.75 == C75.75 template
      ['09.02', 'A.4.5.2.11', 105000], // genteng metal berpasir == warna pasir
    ];
    for (const [wbs, code, price] of cases) {
      const w = r.workItems.find((x) => x.wbsCode === wbs)!;
      expect(w.ahspCode, wbs).toBe(code);
      expect(w.priceStatus, wbs).toBe('BENCHMARK');
      expect(w.priceStatus, wbs).not.toBe('OFFICIAL');
      expect(w.unitPrice, wbs).toBe(price);
      expect(w.isPriceFabricated, wbs).toBe(true); // benchmark = indikatif, ditandai jujur
    }
  });

  it('2 kandidat DITOLAK: plesteran 1:4 != 1:5 dan kloset jongkok/standar != duduk monoblok', () => {
    const r = gen5x10();
    const plesteran = r.workItems.find((x) => x.wbsCode === '06.01')!;
    expect(plesteran.ahspCode).toBe('A.4.4.2.4'); // kode asli dipertahankan
    expect(plesteran.ahspCode).not.toBe('A.4.4.2.2');
    expect(plesteran.priceStatus).toBe('PRICE_UNAVAILABLE');

    const kloset = r.workItems.find((x) => x.wbsCode === '12.01')!;
    expect(kloset.ahspCode).toBe('A.5.1.1.2'); // kode asli dipertahankan
    expect(kloset.ahspCode).not.toBe('A.5.1.1.1');
    expect(kloset.priceStatus).toBe('PRICE_UNAVAILABLE');
  });

  it('resolver: kode lama yang tak terpetakan tetap PRICE_UNAVAILABLE (tidak diam-diam dialihkan)', () => {
    for (const oldCode of ['A.2.2.1.4', 'A.4.4.3.35', 'A.4.2.1.22', 'A.4.5.2.32', 'A.4.4.2.4', 'A.5.1.1.2']) {
      const res = parametricVolumeEngine.resolveUnitPrice(oldCode);
      expect(res.unitPrice, oldCode).toBeNull();
      expect(res.resolution, oldCode).toBe('PRICE_UNAVAILABLE');
    }
  });
});

describe('B.4a — luas KM dari data spaces template aktif + invarian bidang lantai', () => {
  it('T36 tidak berubah: KM 2,25 m² dari spaces-nya sendiri', () => {
    const r = parametricVolumeEngine.generateRABFromTemplate({
      templateId: 'template-house-type-36-single-floor',
      parameters: {},
      region: 'DKI Jakarta',
    });
    expect(r.workItems.find((w) => w.wbsCode === '07.03')!.quantity).toBe(2.25);
    expect(r.workItems.find((w) => w.wbsCode === '07.02')!.quantity).toBe(33.75);
  });

  it('T45 terkoreksi: KM 3,0 m² sesuai spaces T45 (bukan konstanta T36 2,25)', () => {
    const r = parametricVolumeEngine.generateRABFromTemplate({
      templateId: 'template-house-type-45-single-floor',
      parameters: { buildingArea: 50, floorCount: 1, buildingWidth: 5, buildingLength: 10 },
      region: 'DKI Jakarta',
    });
    expect(r.workItems.find((w) => w.wbsCode === '07.03')!.quantity).toBe(3);
    expect(r.workItems.find((w) => w.wbsCode === '07.02')!.quantity).toBe(47);
  });

  it('invarian lantai: qty(07.02) + qty(07.03) == luas bangunan (default & batas, semua template rumah)', () => {
    const houseIds = ALL_TEMPLATE_IDS.filter((id) => id.includes('house') || id.includes('shophouse'));
    for (const id of houseIds) {
      for (const params of [{}, BOUNDARY_PARAMS[id]]) {
        const r = parametricVolumeEngine.generateRABFromTemplate({ templateId: id, parameters: params, region: 'DKI Jakarta' });
        const kering = r.workItems.find((w) => w.wbsCode === '07.02')!.quantity;
        const km = r.workItems.find((w) => w.wbsCode === '07.03')!.quantity;
        const area = Number(r.parametersUsed.buildingArea);
        expect(Math.abs(kering + km - area), `${id} params=${JSON.stringify(params)}`).toBeLessThan(0.01);
      }
    }
  });
});

describe('B.4b — konstanta tetap template dinyatakan sebagai belum diskalakan (blocker S6)', () => {
  it('limitations hasil memuat pengungkapan parameter tetap untuk template rumah', () => {
    const r = parametricVolumeEngine.generateRABFromTemplate({
      templateId: 'template-house-type-36-single-floor',
      parameters: {},
      region: 'DKI Jakarta',
    });
    expect((r.limitations ?? []).some((l) => l.includes('BELUM diskalakan'))).toBe(true);
  });

  it('asumsi per item menandai kusen/kolom/titik sebagai PARAMETER TETAP', () => {
    const r = parametricVolumeEngine.generateRABFromTemplate({
      templateId: 'template-house-type-36-single-floor',
      parameters: {},
      region: 'DKI Jakarta',
    });
    for (const wbs of ['10.01', '04.02', '14.01', '14.02']) {
      const w = r.workItems.find((x) => x.wbsCode === wbs)!;
      expect(w.assumptionsUsed.join(' '), wbs).toContain('PARAMETER TETAP TEMPLATE');
      expect(w.assumptionsUsed.join(' '), wbs).toContain('FORMULA_UNVERIFIED');
    }
  });
});

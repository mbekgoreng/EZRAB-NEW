/**
 * parametricRabIntegrity.test.ts — Remediasi integritas engine RAB
 * (S1–S5 + Fase 8 sisi engine), menindaklanjuti audit Fase 1 yang menemukan:
 *
 * - S1: Rabat beton — volume m² dikalikan tarif per m³ (UNIT_MISMATCH,
 *   50 m² × Rp890.000 = Rp44.500.000 untuk pekerjaan senilai 2,5 m³).
 * - S2: 10 item dihargai konstanta datar Rp150.000 buta-satuan
 *   ('parametric.borongan.default') = 41,4% biaya langsung contoh 5x10.
 * - S3: Plesteran 282 m² ikut konstanta itu (formula volumenya sendiri sah).
 * - S4: Septic tank memakai harga pipa PVC 3/4" (kode A.5.1.1.19);
 *   daun pintu memakai harga daun jendela (kode A.4.6.1.5).
 * - S5: Kategori 13_INSTALASI_AIR kosong tanpa pernyataan cakupan.
 *
 * Kontrak yang dikunci tes ini:
 * - Tidak ada harga tanpa sumber tertelusur: tak terpetakan = null di
 *   resolver, 0 + priceStatus eksplisit di hasil, dikeluarkan dari total.
 * - Satuan kuantitas dan satuan tarif yang terbukti berbeda = UNIT_MISMATCH.
 * - Total dengan item tak berharga = INCOMPLETE (parsial), bukan final.
 */
import { describe, it, expect } from 'vitest';
import { parametricVolumeEngine } from '../engine/parametricVolumeEngine/parametricVolumeEngine';
import { masterBuildingTemplateRegistry } from '../data/buildingTemplates/masterTemplateRegistry';
import type { MasterBuildingTemplate } from '../data/buildingTemplates/schema/types';

const HOUSE_TEMPLATE_IDS = [
  'template-house-type-36-single-floor',
  'template-house-type-45-single-floor',
  'template-house-type-70-single-floor',
  'template-house-type-36-two-floor',
];

/** Contoh audit: "buatkan rab rumah 5x10" -> template T45, W=5, L=10, DKI. */
function generate5x10() {
  return parametricVolumeEngine.generateRABFromTemplate({
    templateId: 'template-house-type-45-single-floor',
    parameters: { buildingArea: 50, floorCount: 1, buildingWidth: 5, buildingLength: 10 },
    region: 'DKI Jakarta',
  });
}

describe('S1 — Rabat beton: volume m³ dari ketebalan sumber, bukan m² × tarif m³', () => {
  it('rabat 5x10 = 2,5 m³ × Rp890.000 = Rp2.225.000 (bukan Rp44.500.000)', () => {
    const r = generate5x10();
    const rabat = r.workItems.find((w) => w.wbsCode === '07.01')!;
    expect(rabat).toBeDefined();
    expect(rabat.unit).toBe('m³');
    expect(rabat.quantity).toBe(2.5);
    expect(rabat.unitPrice).toBe(890000);
    expect(rabat.totalPrice).toBe(2225000);
    expect(rabat.totalPrice).not.toBe(44500000);
    expect(rabat.priceStatus).toBe('BENCHMARK');
    expect(rabat.priceUnit).toBe('m3');
    // Dasar ketebalan dinyatakan di struktur hasil, bukan tebakan diam-diam.
    expect(rabat.assumptionsUsed.join(' ')).toContain('5 cm');
    expect(rabat.formula).toContain('0,05');
  });

  it('gerbang satuan: kuantitas m² x tarif per m³ -> UNIT_MISMATCH, harga tidak diterapkan', () => {
    const gateTemplate: MasterBuildingTemplate = {
      id: 'template-test-unit-gate',
      code: 'TEST-UNIT-GATE',
      name: 'Template Uji Gerbang Satuan',
      category: 'infrastructure',
      version: 'test',
      status: 'draft',
      description: 'Template sintetis khusus tes gerbang satuan.',
      applicableProjectTypes: ['test'],
      units: { length: 'm', area: 'm²', volume: 'm³' },
      parameters: {},
      assumptions: {},
      spaces: [],
      structuralSystem: { foundation: '-', superstructure: '-', roofStructure: '-' },
      materialSystem: { wall: '-', floor: '-', ceiling: '-', roofCover: '-' },
      workItems: [
        {
          stableId: 'test-gate-01',
          wbsCode: '99.01',
          name: 'Item Uji Satuan m2 vs Tarif m3',
          category: '07_LANTAI',
          unit: 'm²',
          requiredInputs: [],
          ahspCandidates: [],
          // A.4.1.1.1 adalah tarif benchmark per m3 — pasangan yang dulu
          // menghasilkan cacat S1 pada rabat beton.
          defaultAhspCode: 'A.4.1.1.1',
          quantityRule: () => ({
            quantity: 50,
            unit: 'm²',
            formula: 'Luas',
            formulaInputs: {},
            assumptionsUsed: [],
            status: 'calculated',
            confidence: 1,
            requiresReview: false,
            warnings: [],
            errors: [],
            calculationTrace: [],
          }),
        },
      ],
      limitations: [],
      sourceMetadata: { standardReference: 'test', lastUpdated: '2026-10-22', author: 'test' },
      reviewStatus: { isReviewed: false },
    };
    masterBuildingTemplateRegistry.registerTemplate(gateTemplate);

    const r = parametricVolumeEngine.generateRABFromTemplate({ templateId: 'template-test-unit-gate' });
    const item = r.workItems[0];
    expect(item.priceStatus).toBe('UNIT_MISMATCH');
    expect(item.unitPrice).toBe(0);
    expect(item.totalPrice).toBe(0);
    expect(r.totalDirectCost).toBe(0);
    expect(r.totalStatus).toBe('INCOMPLETE');
    expect(r.unpricedItems?.[0]?.priceStatus).toBe('UNIT_MISMATCH');
  });
});

describe('S2 — fallback datar Rp150.000 dihapus sebagai sumber harga', () => {
  it('resolver: kode tak dikenal -> unitPrice null + PRICE_UNAVAILABLE (bukan 150.000)', () => {
    const res = parametricVolumeEngine.resolveUnitPrice('KODE.TIDAK.ADA.99');
    expect(res.unitPrice).toBeNull();
    expect(res.resolution).toBe('PRICE_UNAVAILABLE');
    expect(res.isFabricated).toBe(false);
  });

  it('semua template rumah: tidak ada item berharga dari sumber CUSTOM / nama generik', () => {
    for (const id of HOUSE_TEMPLATE_IDS) {
      const r = parametricVolumeEngine.generateRABFromTemplate({ templateId: id, parameters: {}, region: 'DKI Jakarta' });
      for (const w of r.workItems) {
        expect(w.ahspSource, `${id}/${w.wbsCode}`).not.toBe('CUSTOM');
        expect((w.ahspName ?? '').startsWith('Analisa Satuan Pekerjaan ('), `${id}/${w.wbsCode}`).toBe(false);
        // Setiap item: berharga tertelusur ATAU tak berharga eksplisit.
        if (w.priceStatus === 'PRICE_UNAVAILABLE' || w.priceStatus === 'UNIT_MISMATCH' || w.priceStatus === 'AHSP_UNRESOLVED') {
          expect(w.unitPrice, `${id}/${w.wbsCode}`).toBe(0);
          expect(w.totalPrice, `${id}/${w.wbsCode}`).toBe(0);
          expect(w.requiresReview, `${id}/${w.wbsCode}`).toBe(true);
        } else {
          expect(w.unitPrice, `${id}/${w.wbsCode}`).toBeGreaterThan(0);
          expect(w.totalPrice, `${id}/${w.wbsCode}`).toBe(Math.round(w.quantity * w.unitPrice));
        }
      }
      // Total hanya menjumlah item berharga.
      const sum = r.workItems.reduce((s, w) => s + w.totalPrice, 0);
      expect(Math.abs(sum - r.totalDirectCost)).toBeLessThan(1);
    }
  });

  it('contoh 5x10: tepat 6 item tak berharga, total parsial INCOMPLETE', () => {
    // PERUBAHAN EKSPETAKSI (WS-1): semula 10 item tak berharga / total
    // 79.575.575 / 97.161.778. Empat kode kini terpetakan ke entri tabel
    // benchmark yang identitas+spesifikasi+satuannya TERBUKTI sama
    // (bouwplank A.2.2.1.1, keramik 40x40 A.4.4.3.3, rangka atap
    // A.4.5.2.3, genteng metal A.4.5.2.11 — lihat parametricTemplateAudit
    // .test.ts), dan luas KM pada 07.02 kini mengikuti spaces template
    // (T45: 3,0 m²). Sisa 6 item tetap PRICE_UNAVAILABLE; total tetap
    // PARSIAL/INCOMPLETE — bukan final.
    const r = generate5x10();
    expect(r.unpricedItemCount).toBe(6);
    expect(r.unpricedItems).toHaveLength(6);
    expect(r.unpricedItems!.every((u) => u.priceStatus === 'PRICE_UNAVAILABLE')).toBe(true);
    expect(r.totalStatus).toBe('INCOMPLETE');
    expect(r.isReadyForSpreadsheet).toBe(false);
    // Total sesudah remediasi WS-1: 19 item berharga benchmark.
    expect(r.totalDirectCost).toBe(115459575);
    expect(r.totalRabCost).toBe(140976142);
  });
});

describe('S3 — Plesteran: formula volume sah (282 m²), harga kini jujur tak tersedia', () => {
  it('volume tetap (42,5 x 3,6 - 12) x 2 sisi = 282 m²; A.4.4.2.4 tak terpetakan -> PRICE_UNAVAILABLE', () => {
    const r = generate5x10();
    const plesteran = r.workItems.find((w) => w.wbsCode === '06.01')!;
    expect(plesteran.quantity).toBe(282);
    expect(plesteran.ahspCode).toBe('A.4.4.2.4');
    expect(plesteran.priceStatus).toBe('PRICE_UNAVAILABLE');
    expect(plesteran.unitPrice).toBe(0);
    expect(plesteran.totalPrice).toBe(0);
    // TIDAK dipetakan paksa ke plesteran 1:5 (A.4.4.2.2) — campuran berbeda.
    expect(plesteran.ahspCode).not.toBe('A.4.4.2.2');
  });
});

describe('S4 — pemetaan salah-item dikoreksi (tes negatif untuk semua template rumah)', () => {
  it('septic tank tidak pernah berharga pipa PVC; daun pintu tidak pernah berharga daun jendela', () => {
    for (const id of HOUSE_TEMPLATE_IDS) {
      const r = parametricVolumeEngine.generateRABFromTemplate({ templateId: id, parameters: {}, region: 'DKI Jakarta' });
      const septic = r.workItems.find((w) => w.wbsCode === '12.02')!;
      expect(septic.ahspCode, id).toBe('A.5.1.1.30');
      expect(septic.unitPrice, id).toBe(3200000);
      expect(septic.unitPrice, id).not.toBe(38500);
      expect(septic.ahspName ?? '', id).not.toContain('Pipa PVC');

      const pintu = r.workItems.find((w) => w.wbsCode === '10.02')!;
      expect(pintu.ahspCode, id).toBe('A.4.6.1.2');
      expect(pintu.unitPrice, id).toBe(950000);
      expect(pintu.unitPrice, id).not.toBe(420000);
      expect((pintu.ahspName ?? '').toLowerCase(), id).not.toContain('jendela');
      expect(pintu.ahspName ?? '', id).toContain('Daun pintu panel');
    }
  });
});

describe('S5 — instalasi air: keterbatasan cakupan dinyatakan, item tidak dikarang', () => {
  it('hasil generate memuat pernyataan cakupan 13_INSTALASI_AIR; tidak ada item kategori itu', () => {
    const r = generate5x10();
    expect(r.workItems.some((w) => w.category === '13_INSTALASI_AIR')).toBe(false);
    expect(r.categorySubtotals['13_INSTALASI_AIR']).toBe(0);
    expect((r.limitations ?? []).some((l) => l.includes('13_INSTALASI_AIR'))).toBe(true);
    expect(r.warnings.some((w) => w.includes('KETERBATASAN CAKUPAN'))).toBe(true);
  });
});

describe('Fase 8 — status per item tertelusur & spreadsheet tidak menerima harga palsu', () => {
  it('setiap item 5x10 membawa priceStatus; daftar tak berharga konsisten dengan item', () => {
    const r = generate5x10();
    for (const w of r.workItems) {
      expect(w.priceStatus, w.wbsCode).toBeDefined();
    }
    const unpricedFromItems = r.workItems.filter(
      (w) => w.priceStatus === 'PRICE_UNAVAILABLE' || w.priceStatus === 'UNIT_MISMATCH' || w.priceStatus === 'AHSP_UNRESOLVED'
    );
    expect(r.unpricedItems!.map((u) => u.wbsCode).sort()).toEqual(unpricedFromItems.map((w) => w.wbsCode).sort());
  });

  it('toRabItems: item tak berharga diteruskan sebagai null + priceStatus, bukan Rp0', () => {
    const r = generate5x10();
    const rows = parametricVolumeEngine.toRabItems(r);
    const plesteran = rows.find((x: any) => x.wbsCode === '06.01');
    expect(plesteran.unitPrice).toBeNull();
    expect(plesteran.totalPrice).toBeNull();
    expect(plesteran.priceStatus).toBe('PRICE_UNAVAILABLE');
    const rabat = rows.find((x: any) => x.wbsCode === '07.01');
    expect(rabat.unitPrice).toBe(890000);
    expect(rabat.priceStatus).toBe('BENCHMARK');
  });
});

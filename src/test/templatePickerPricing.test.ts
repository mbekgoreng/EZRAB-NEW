import { describe, it, expect } from 'vitest';
import { resolveTemplatePickerPricing } from '../components/estimator/templatePickerPricing';
import { masterBuildingTemplateRegistry } from '../data/buildingTemplates/masterTemplateRegistry';
import type { MasterBuildingTemplate } from '../data/buildingTemplates/schema/types';

// Regresi audit picker template 2026-10-26: tab "Dari Template" lama membaca
// harga HANYA dari ahspCandidates[0].unitPriceEstimate (kosong di semua
// template) + volume dipatok 1 + cap VERIFIED/'AHSP 2026' palsu.
// Perilaku baru: harga + volume dari ParametricVolumeEngine, dengan koreksi
// kode template ke padanan resmi 2026 (plesteran → 3.7.4, keramik KM →
// 3.9.8.9, jalan → C.37/E.1/E.11). Mencakup KETUJUH template di dropdown.
describe('templatePickerPricing — semua template', () => {
  const all = masterBuildingTemplateRegistry.getAllTemplates();
  const byId = (id: string) =>
    all.find((t) => t.id === id) as MasterBuildingTemplate;

  it('dropdown berisi 7 template', () => {
    expect(all.length).toBe(7);
  });

  // Kelima template rumah/ruko BERBAGI daftar kerja HOUSE_TYPE_36_WORK_ITEMS
  // (hanya parameter yang berbeda) — jadi ekspektasi harga/volume sama.
  const houseIds = [
    'template-house-type-36-single-floor',
    'template-house-type-45-single-floor',
    'template-house-type-70-single-floor',
    'template-house-type-36-two-floor',
    'template-shophouse-2-floor',
  ];
  for (const id of houseIds) {
    it(`${id}: 21 ber-harga (19 benchmark + 2 official), 4 jujur kosong`, () => {
      const tpl = byId(id);
      const map = resolveTemplatePickerPricing(tpl);
      expect(map.size).toBe(25);
      for (const p of map.values()) expect(p.engineOk).toBe(true);
      const priced = [...map.values()].filter((p) => p.unitPrice != null);
      expect(priced.length).toBe(21);
      expect(priced.filter((p) => p.priceKind === 'BENCHMARK').length).toBe(19);
      const official = [...map.entries()].filter(
        ([, p]) => p.priceKind === 'OFFICIAL',
      );
      expect(official.length).toBe(2);
      for (const [, p] of official) expect(p.priceStatus).toBe('PRICE_RESOLVED');
      // Kode resmi hasil koreksi 2026-10-26.
      const byCode = new Map(
        tpl.workItems.map((w) => [w.defaultAhspCode, map.get(w.stableId)]),
      );
      expect(byCode.get('3.7.4')?.unitPrice).toBeGreaterThan(0);
      expect(byCode.get('3.9.8.9')?.unitPrice).toBeGreaterThan(0);
      // Sisa yang jujur kosong: komposit + kloset ambigu.
      const unpriced = tpl.workItems
        .filter((w) => map.get(w.stableId)?.unitPrice == null)
        .map((w) => w.defaultAhspCode)
        .sort();
      expect(unpriced).toEqual([
        'A.4.1.1.28',
        'A.4.1.1.35',
        'A.4.1.1.36',
        'A.5.1.1.2',
      ]);
    });
  }

  it('jalan beton: 3 official (C.37/E.1/E.11), 2 jujur kosong', () => {
    const tpl = byId('template-concrete-road-rigid-pavement');
    const map = resolveTemplatePickerPricing(tpl);
    expect(map.size).toBe(5);
    const byCode = new Map(
      tpl.workItems.map((w) => [w.defaultAhspCode, map.get(w.stableId)]),
    );
    expect(byCode.get('C.37')?.priceKind).toBe('OFFICIAL');
    expect(byCode.get('E.1')?.priceKind).toBe('OFFICIAL');
    expect(byCode.get('E.11')?.priceKind).toBe('OFFICIAL');
    expect(byCode.get('E.11')?.unitPrice).toBe(2071748);
    // Wiremesh + joint sealant: tidak ada item mandiri padanannya di master.
    expect(byCode.get('BM.5.3.1.5')?.unitPrice).toBeNull();
    expect(byCode.get('BM.5.3.1.8')?.unitPrice).toBeNull();
    // Volume mesin jalan (bukan patokan 1): clearing & agregat & beton > 1.
    expect(byCode.get('C.37')?.volume).toBeGreaterThan(1);
    expect(byCode.get('E.11')?.volume).toBeGreaterThan(1);
  });

  it('U-ditch: 7/7 ber-harga benchmark, volume mesin', () => {
    const tpl = byId('template-uditch-drainage');
    const map = resolveTemplatePickerPricing(tpl);
    expect(map.size).toBe(7);
    for (const p of map.values()) {
      expect(p.engineOk).toBe(true);
      expect(p.unitPrice).not.toBeNull();
      expect(p.priceKind).toBe('BENCHMARK');
      expect(p.priceStatus).toBe('PRICE_ESTIMATED');
    }
  });

  it('volume dari quantityRule mesin, bukan patokan 1 (T36)', () => {
    const tpl = byId('template-house-type-36-single-floor');
    const map = resolveTemplatePickerPricing(tpl);
    const byCode = new Map(
      tpl.workItems.map((w) => [w.defaultAhspCode, map.get(w.stableId)]),
    );
    expect(byCode.get('A.2.2.1.9')?.volume).toBe(64); // (6+2)x(6+2)
    expect(byCode.get('A.2.3.1.1')?.volume).toBe(23.04);
    expect(byCode.get('A.4.4.1.1')?.volume).toBe(114);
  });

  it('template tak dikenal / kosong: fallback tanpa throw', () => {
    const fake = {
      id: 'tidak-ada',
      workItems: [
        {
          stableId: 'x-1',
          wbsCode: '01.01',
          name: 'Item X',
          unit: 'm²',
          ahspCandidates: [],
        },
      ],
    } as unknown as MasterBuildingTemplate;
    const m = resolveTemplatePickerPricing(fake);
    expect(m.get('x-1')).toMatchObject({
      volume: 1,
      unitPrice: null,
      engineOk: false,
    });
    expect(resolveTemplatePickerPricing(null).size).toBe(0);
    expect(resolveTemplatePickerPricing(undefined).size).toBe(0);
  });
});

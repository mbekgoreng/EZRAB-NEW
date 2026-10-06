import { describe, it, expect } from 'vitest';
import { PriceResolver2026 } from '../../src/data/priceDatabase2026/resolver';
import { OFFICIAL_BM_2026_DHSP_MAP } from '../../src/data/nationalCostDatabase/officialBinaMargaDhsp2026';
import { OFFICIAL_BM_2026_LABOR, OFFICIAL_BM_2026_MATERIALS, OFFICIAL_BM_2026_EQUIPMENT } from '../../src/data/nationalCostDatabase/officialBinaMargaPrices2026';
import { ALL_OFFICIAL_AHSP_ITEMS } from '../../src/data/nationalCostDatabase/masterRegistry';

const resolver = PriceResolver2026.getInstance();

describe('BINA MARGA 2026 FORENSIC TEST SUITE', () => {
  // Test 1: 2.1.(1) - Drainase
  it('Item 1: 2.1.(1) Galian Drainase has exact mathematical harmony', () => {
    const canonical = ALL_OFFICIAL_AHSP_ITEMS.find((a) => a.code === '2.1.(1)');
    expect(canonical).toBeDefined();

    const comp = resolver.resolveAhspUnitPrice(canonical!);
    expect(comp.pricingStatus).toBe('FULL');
    expect(comp.hspPrice).toBe(79885);
    // Direct Cost is within rounding tolerance of 4-decimal printed coefficients
    expect(comp.unitPrice).toBeGreaterThan(72600);
    expect(comp.unitPrice).toBeLessThan(72630);
    expect(comp.overheadAmount).toBeCloseTo(7262.32, 1);

    // Labor component prices
    const pekerja = comp.labor.components.find((c) => c.itemCode === 'L01');
    expect(pekerja).toBeDefined();
    expect(pekerja?.unitPrice).toBe(27643.54);
    expect(pekerja?.subtotalPerUnit).toBeCloseTo(0.2914 * 27643.54, 1);

    const mandor = comp.labor.components.find((c) => c.itemCode === 'L03');
    expect(mandor).toBeDefined();
    expect(mandor?.unitPrice).toBe(33312.62);

    // Equipment component prices
    const excavator = comp.equipment.components.find((c) => c.itemCode === 'E10a');
    expect(excavator).toBeDefined();
    expect(excavator?.unitPrice).toBe(281237.82);

    const dumpTruck = comp.equipment.components.find((c) => c.itemCode === 'E08');
    expect(dumpTruck).toBeDefined();
    expect(dumpTruck?.unitPrice).toBe(433363.61);
  });

  // Test 2: B.2 item - 2.2.(1) Pasangan Batu dengan Mortar
  it('Item 2: B.2 (2.2.(1)) Pasangan Batu dengan Mortar is in DHSP Map', () => {
    const item = OFFICIAL_BM_2026_DHSP_MAP.get('2.2.(1)');
    expect(item).toBeDefined();
    expect(item?.tag).toBe('B.2');
    expect(item?.unitPrice).toBe(1000948);
    expect(item?.directCost).toBeCloseTo(909953.47, 1);
    expect(item?.overheadAmount).toBeCloseTo(90995.35, 1);
  });

  // Test 3: C item - 3.1.(1) Galian Biasa
  it('Item 3: C.1 (3.1.(1)) Galian Biasa', () => {
    const item = OFFICIAL_BM_2026_DHSP_MAP.get('3.1.(1)');
    expect(item).toBeDefined();
    expect(item?.tag).toBe('C.1');
    expect(item?.unitPrice).toBe(42189);
    expect(item?.directCost).toBeCloseTo(38354.36, 1);
    expect(item?.sourceSheet).toBe('C - Tanah dan Geosintetik');
  });

  // Test 4: D item - 4.1.(1) Laburan Aspal Satu Lapis
  it('Item 4: D item in Preventif', () => {
    const item = Array.from(OFFICIAL_BM_2026_DHSP_MAP.values()).find((i) => i.tag.startsWith('D.'));
    expect(item).toBeDefined();
    expect(item?.sourceSheet).toBe('D - Preventif');
    expect(item?.unitPrice).toBeGreaterThan(0);
  });

  // Test 5: E item - 5.1.(1a) Lapis Fondasi Agregat Kelas A
  it('Item 5: E.1 (5.1.(1a)) Lapis Fondasi Agregat Kelas A', () => {
    const item = OFFICIAL_BM_2026_DHSP_MAP.get('5.1.(1a)');
    expect(item).toBeDefined();
    expect(item?.tag).toBe('E.1');
    expect(item?.unitPrice).toBe(570185);
    expect(item?.directCost).toBeCloseTo(518350.75, 1);
    expect(item?.sourceSheet).toBe('E - Perkerasan Berbutir dan Per');
  });

  // Test 6: F item - 6.1.(1) Lapis Resap Pengikat
  it('Item 6: F.1 (6.1.(1)) Lapis Resap Pengikat', () => {
    const item = OFFICIAL_BM_2026_DHSP_MAP.get('6.1.(1)');
    expect(item).toBeDefined();
    expect(item?.tag).toBe('F.1');
    expect(item?.unitPrice).toBe(22131);
    expect(item?.directCost).toBeCloseTo(20119.4, 1);
    expect(item?.sourceSheet).toBe('F - Perkerasan Aspal');
  });

  // Test 7: G item - 7.1.(1a2) Beton Struktur fc 50 MPa
  it('Item 7: G.1 (7.1.(1a2)) Beton Struktur', () => {
    const item = OFFICIAL_BM_2026_DHSP_MAP.get('7.1.(1a2)');
    expect(item).toBeDefined();
    expect(item?.tag).toBe('G.1');
    expect(item?.unitPrice).toBe(2142130);
    expect(item?.directCost).toBeCloseTo(1947391.57, 1);
    expect(item?.sourceSheet).toBe('G - Struktur');
  });

  // Test 8: H item - Rehabilitasi Jembatan
  it('Item 8: H item in Rehabilitasi Jembatan', () => {
    const item = Array.from(OFFICIAL_BM_2026_DHSP_MAP.values()).find((i) => i.tag.startsWith('H.'));
    expect(item).toBeDefined();
    expect(item?.sourceSheet).toBe('H - Rehabilitasi Jembatan');
    expect(item?.unitPrice).toBeGreaterThan(0);
  });

  // Test 9: I item - Harian dan Pekerjaan Lain-lain
  it('Item 9: I item in Harian', () => {
    const item = Array.from(OFFICIAL_BM_2026_DHSP_MAP.values()).find((i) => i.tag.startsWith('I.'));
    expect(item).toBeDefined();
    expect(item?.sourceSheet).toBe('I - Harian dan Pekerjaan Lain-l');
    expect(item?.unitPrice).toBeGreaterThan(0);
  });

  // Test 10: J item - Pemeliharaan
  it('Item 10: J item in Pemeliharaan', () => {
    const item = Array.from(OFFICIAL_BM_2026_DHSP_MAP.values()).find((i) => i.tag.startsWith('J.'));
    expect(item).toBeDefined();
    expect(item?.sourceSheet).toBe('J - Pemeliharaan');
    expect(item?.unitPrice).toBeGreaterThan(0);
  });

  // NEGATIVE TESTS (SECTION 21)
  describe('Negative Tests (Section 21)', () => {
    it('Test A: Resource with no price returns null (never 0)', () => {
      const res = resolver.resolveResourcePrice({
        resourceCode: 'NON_EXISTENT_RESOURCE_XYZ',
        resourceType: 'material',
        unit: 'kg',
      });
      expect(res.status).toBe('NOT_FOUND');
      expect(res.price).toBeNull();
      expect(res.price).not.toBe(0);
    });

    it('Test B: AHSP with partial prices returns PARTIAL', () => {
      const comp = resolver.resolveAhspUnitPrice({
        code: 'TEST-PARTIAL',
        name: 'Analisa Parsial Uji Coba',
        unit: 'm2',
        domain: 'BINA_MARGA',
        laborComponents: [{ code: 'L01', name: 'Pekerja', unit: 'jam', coefficient: 1 }],
        materialComponents: [{ code: 'M_UNKNOWN_999', name: 'Bahan Fiktif', unit: 'kg', coefficient: 1 }],
      });
      expect(comp.pricingStatus).toBe('PARTIAL');
      expect(comp.missing.length).toBeGreaterThan(0);
      expect(comp.missing[0].name).toBe('Bahan Fiktif');
    });

    it('Test C: Missing AHSP price returns null, never 0', () => {
      const comp = resolver.resolveAhspUnitPrice({
        code: '1.2',
        name: 'Mobilisasi',
        unit: 'ls',
        domain: 'BINA_MARGA',
      });
      expect(comp.pricingStatus).toBe('MISSING');
      expect(comp.unitPrice).toBeNull();
      expect(comp.hspPrice).toBeNull();
      expect(comp.unitPrice).not.toBe(0);
      expect(comp.hspPrice).not.toBe(0);
    });

    it('Test D: Unrecognized resource code produces NOT_FOUND status', () => {
      const res = resolver.resolveResourcePrice({
        resourceCode: 'ZZZ_INVALID_CODE',
        resourceType: 'equipment',
        unit: 'jam',
      });
      expect(res.status).toBe('NOT_FOUND');
      expect(res.price).toBeNull();
    });

    it('Test E: Preserves 1,163 canonical items without deletion', () => {
      const bmItems = ALL_OFFICIAL_AHSP_ITEMS.filter((a) => a.domain === 'BINA_MARGA');
      expect(bmItems.length).toBe(1163);
    });
  });
});

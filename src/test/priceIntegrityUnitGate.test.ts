/**
 * PRICE INTEGRITY AUDIT — unit gate & provenance tier (2026-10-17)
 *
 * Membuktikan tiga aturan garis keras:
 * 1. UNIT GATE: kandidat containment tunggal yang satuannya tidak kompatibel
 *    dengan satuan permintaan TIDAK BOLEH resolve — harus PRICE_NOT_FOUND
 *    (fail-closed). Mengalikan harga zak↔kg diam-diam adalah cacat.
 * 2. PROVENANCE TIER: harga seed pasar yang lolos EXACT_MATCH/NORMALIZED_MATCH
 *    tidak boleh dilabeli OFFICIAL_AHSP (RESMI AHSP). Tier dicatat saat ingest
 *    (sourceTier) dan dipakai komposisi biaya untuk fallbackKind.
 * 3. UNRESOLVED PATH: rantai OFFICIAL→MARKET→ASSUMPTION→UNRESOLVED berakhir
 *    dengan price null + usableInFinal false — tidak pernah Rp0.
 */
import { describe, it, expect } from 'vitest';
import { PriceResolver } from '../engine/pricing/resolver/priceResolver';
import { PriceRepository } from '../engine/pricing/repository/priceRepository';
import { CostCompositionEngine } from '../engine/cost/composition/costCompositionEngine';
import { resolveWithFallback } from '../engine/pricing/assumption/fallbackResolver';
import {
  toRabPriceStatus,
  resolveOfficialPriceForMappedItem,
} from '../engine/constructionCalculators/ahsp2026PriceIntegration';

const repo = PriceRepository.getInstance();
const resolver = new PriceResolver();

let seeded = false;
function seedOnce() {
  if (seeded) return;
  seeded = true;
  // Unit-gate fixtures: kata-kata unik per fixture agar tidak terjadi
  // pencocokan silang antar-fixture pada branch kata kunci.
  repo.addCustomPrice({
    code: 'TEST-UG-MM-001', name: 'Xyzzyplugh Mismatch Abc', unit: 'kg',
    price: 15000, priceSource: 'TEST',
  });
  repo.addCustomPrice({
    code: 'TEST-UG-OK-001', name: 'Qwertyplugh Cocok Def', unit: 'kg',
    price: 15000, priceSource: 'TEST',
  });
  const mkt: any = repo.addCustomPrice({
    code: 'TEST-TIER-MKT-001', name: 'Plugh Tier Pasar', unit: 'kg',
    price: 20000, priceSource: 'Depo Bangunan TEST',
  });
  mkt.sourceTier = 'MARKET';
  const off: any = repo.addCustomPrice({
    code: 'TEST-TIER-OFF-001', name: 'Plugh Tier Resmi', unit: 'kg',
    price: 21000, priceSource: 'SE DJBK TEST',
  });
  off.sourceTier = 'OFFICIAL';
}

function composeWith(code: string, unit: string) {
  const engine = new CostCompositionEngine();
  const input: any = {
    quantity: 1,
    quantityUnit: 'm3',
    ahspDefinition: {
      id: 'TEST-AHSP-1', code: 'T.1', codeNormalized: 't.1', name: 'AHSP Uji',
      unit: 'm3', domain: 'CIPTA_KARYA', category: 'TEST', version: '2026',
      sourceDocument: 'TEST',
      laborComponents: [],
      materialComponents: [
        { id: 'c1', type: 'material', itemCode: code, itemName: `Komponen ${code}`, unit, coefficient: 2 },
      ],
      equipmentComponents: [],
      totalLaborCoefficient: 0, totalMaterialCoefficient: 2, totalEquipmentCoefficient: 0,
      provenance: {},
    },
    priceContext: { projectId: 'TEST-PROJ' },
  };
  return engine.compose(input);
}

describe('1. UNIT GATE — satuan tak kompatibel tidak boleh resolve', () => {
  it('kandidat containment tunggal + satuan beda → PRICE_NOT_FOUND (bukan NORMALIZED_MATCH)', () => {
    seedOnce();
    // 'Xyzzyplugh Mismatch Abc' (kg) vs permintaan m3: satu-satunya kandidat
    // containment memiliki satuan tak kompatibel → ditolak dari kandidat.
    const r: any = resolver.resolve({ name: 'Xyzzyplugh Mismatch', unit: 'm3' });
    expect(r.status).toBe('PRICE_NOT_FOUND');
    expect(r.resolvedPrice).toBeUndefined();
  });

  it('kontrol: satuan sama → tetap NORMALIZED_MATCH', () => {
    seedOnce();
    const r: any = resolver.resolve({ name: 'Qwertyplugh Cocok', unit: 'kg' });
    expect(r.status).toBe('NORMALIZED_MATCH');
    expect(r.resolvedPrice?.price).toBe(15000);
  });

  it('multi-kandidat semua tak kompatibel → PRICE_NOT_FOUND, tidak ada yang resolve', () => {
    seedOnce();
    repo.addCustomPrice({
      code: 'TEST-UG-MC-A', name: 'Plughgamma Satu Abc', unit: 'kg',
      price: 15000, priceSource: 'TEST',
    });
    repo.addCustomPrice({
      code: 'TEST-UG-MC-B', name: 'Plughgamma Dua Def', unit: 'kg',
      price: 16000, priceSource: 'TEST',
    });
    const r: any = resolver.resolve({ name: 'Plughgamma', unit: 'm3' });
    expect(r.status).toBe('PRICE_NOT_FOUND');
    expect(r.resolvedPrice).toBeUndefined();
  });

  it('kontrol: tanpa satuan pada query → perilaku lama (tidak difilter)', () => {
    seedOnce();
    const r: any = resolver.resolve({ name: 'Qwertyplugh Cocok' });
    expect(r.status).toBe('NORMALIZED_MATCH');
  });
});

describe('2. PROVENANCE TIER — pasar tidak boleh dilabeli RESMI AHSP', () => {
  it('master DB memuat kedua tier (ingest tagging terpasang)', () => {
    const tiers = new Set(repo.getAllMasterPrices().map((p: any) => p.sourceTier));
    expect(tiers.has('OFFICIAL')).toBe(true);
    expect(tiers.has('MARKET')).toBe(true);
  });

  it('komposisi: hit pasar → fallbackKind MARKET_REFERENCE', () => {
    seedOnce();
    const res: any = composeWith('TEST-TIER-MKT-001', 'kg');
    const det = res.material.components[0];
    expect(det.priceStatus).toBe('RESOLVED');
    expect(det.fallbackSourceKind).toBe('MARKET_REFERENCE');
    expect(det.fallbackSourceLabel).toBe('REFERENSI PASAR');
  });

  it('komposisi: hit resmi → fallbackKind OFFICIAL_AHSP', () => {
    seedOnce();
    const res: any = composeWith('TEST-TIER-OFF-001', 'kg');
    const det = res.material.components[0];
    expect(det.fallbackSourceKind).toBe('OFFICIAL_AHSP');
    expect(det.fallbackSourceLabel).toBe('RESMI AHSP');
  });
});

describe('3. UNRESOLVED PATH — tidak pernah Rp0', () => {
  it('resolveWithFallback tanpa lookup → price null, usableInFinal false', () => {
    const r = resolveWithFallback({ resourceCode: 'TIDAK-ADA-XYZ-001', unit: 'kg' });
    expect(r.price).toBeNull();
    expect(r.unit).toBeNull();
    expect(r.sourceKind).toBe('UNRESOLVED');
    expect(r.usableInFinal).toBe(false);
  });

  it('toRabPriceStatus: PRICE_INCOMPLETE tanpa harga → PRICE_UNRESOLVED', () => {
    expect(toRabPriceStatus('PRICE_RESOLVED', true)).toBe('PRICE_RESOLVED');
    expect(toRabPriceStatus('PRICE_INCOMPLETE', false)).toBe('PRICE_UNRESOLVED');
    expect(toRabPriceStatus('PRICE_INCOMPLETE', true)).toBe('PRICE_RESOLVED');
    expect(toRabPriceStatus(undefined, true)).toBe('PRICE_RESOLVED');
    expect(toRabPriceStatus(undefined, false)).toBe('PRICE_UNRESOLVED');
    expect(toRabPriceStatus('PRICE_MANUAL', true)).toBe('PRICE_MANUAL');
  });

  it('resolveOfficialPriceForMappedItem: kode resmi → PRICE_RESOLVED + OFFICIAL_AHSP_2026', () => {
    const r: any = resolveOfficialPriceForMappedItem('9.3.5.1', 'CIPTA_KARYA');
    expect(r.status).toBe('PRICE_RESOLVED');
    expect(r.priceSource).toBe('OFFICIAL_AHSP_2026');
    // Nilai dibaca dari data kanonis resmi (bukan karangan): tercatat 2545645.
    expect(r.unitPrice).toBe(2545645);
  });

  it('resolveOfficialPriceForMappedItem: kode tak dikenal → PRICE_UNRESOLVED + null', () => {
    const r: any = resolveOfficialPriceForMappedItem('KODE-TIDAK-ADA-XYZ', 'CIPTA_KARYA');
    expect(r.status).toBe('PRICE_UNRESOLVED');
    expect(r.priceSource).toBe('PRICE_NOT_FOUND');
    expect(r.unitPrice).toBeNull();
  });
});

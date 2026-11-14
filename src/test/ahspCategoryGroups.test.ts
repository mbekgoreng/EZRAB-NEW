import { describe, it, expect } from 'vitest';
import {
  groupAhspCategories,
  ahspGroupKey,
  AHSP_DOMAIN_LABELS,
} from '../components/estimator/ahspCategoryGroups';
import { officialAhspRepository } from '../data/nationalCostDatabase/officialAhspRepository';
import type { NationalAHSPItem } from '../data/nationalCostDatabase/types';

// Regresi dropdown "Kategori AHSP" 2026-10-26: opsi lama adalah daftar datar
// category (38 nilai campur aduk) tanpa pembeda jenis AHSP. Sekarang kategori
// dikelompokkan per domain (Cipta Karya, Bina Marga, SDA, SMKK, Custom)
// dengan kunci filter `domain::category`.
function item(
  domain: NationalAHSPItem['domain'],
  category: string,
  code: string,
): NationalAHSPItem {
  return {
    id: code,
    code,
    codeNormalized: code,
    name: `Item ${code}`,
    unit: 'm2',
    domain,
    category,
    version: '2026',
    year: 2026,
    normativeStatus: 'Normatif',
    method: 'Manual',
    sourceId: 'TEST',
    sourceDocument: 'TEST',
    status: 'ACTIVE',
    laborComponents: [],
    materialComponents: [],
    equipmentComponents: [],
    totalLabor: null,
    totalMaterial: null,
    totalEquipment: null,
    unitPrice: 1000,
    lastUpdated: '2026-01-01',
    dataQualityScore: 100,
  };
}

describe('groupAhspCategories', () => {
  it('urutan grup tetap: Cipta Karya, Bina Marga, SDA, SMKK, Custom', () => {
    const groups = groupAhspCategories([
      item('CUSTOM', 'AHSP Custom', 'C.1'),
      item('SMKK', 'III.1 Penerapan SMKK Risiko Kecil', 'SMKK.0001'),
      item('SUMBER_DAYA_AIR', 'A.1.02', 'A.1.02.1a'),
      item('BINA_MARGA', 'BINA_MARGA', 'C.37'),
      item('CIPTA_KARYA', 'DIVISI 5 - PEKERJAAN MEKANIKAL DAN ELEKTRIKAL', '5.1.1.1'),
    ]);
    expect(groups.map((g) => g.domain)).toEqual([
      'CIPTA_KARYA',
      'BINA_MARGA',
      'SUMBER_DAYA_AIR',
      'SMKK',
      'CUSTOM',
    ]);
    expect(groups.map((g) => g.label)).toEqual([
      'CIPTA KARYA',
      'BINA MARGA',
      'SDA — SUMBER DAYA AIR',
      'SMKK',
      'CUSTOM — AHSP SAYA',
    ]);
    expect(AHSP_DOMAIN_LABELS.CUSTOM).toBe('CUSTOM — AHSP SAYA');
  });

  it('kategori di dalam grup diurutkan jumlah menurun, kunci = domain::category', () => {
    const groups = groupAhspCategories([
      item('CIPTA_KARYA', 'DIVISI 5 - PEKERJAAN MEKANIKAL DAN ELEKTRIKAL', '5.1'),
      item('CIPTA_KARYA', 'DIVISI 5 - PEKERJAAN MEKANIKAL DAN ELEKTRIKAL', '5.2'),
      item('CIPTA_KARYA', 'DIVISI 2 - PEKERJAAN STRUKTUR', '2.1'),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].total).toBe(3);
    expect(groups[0].categories).toEqual([
      {
        key: 'CIPTA_KARYA::DIVISI 5 - PEKERJAAN MEKANIKAL DAN ELEKTRIKAL',
        name: 'DIVISI 5 - PEKERJAAN MEKANIKAL DAN ELEKTRIKAL',
        count: 2,
      },
      {
        key: 'CIPTA_KARYA::DIVISI 2 - PEKERJAAN STRUKTUR',
        name: 'DIVISI 2 - PEKERJAAN STRUKTUR',
        count: 1,
      },
    ]);
    expect(
      ahspGroupKey({ domain: 'SMKK', category: 'III.1 Penerapan SMKK Risiko Kecil' }),
    ).toBe('SMKK::III.1 Penerapan SMKK Risiko Kecil');
  });

  it('nama kategori yang sama di dua domain tidak tercampur', () => {
    const groups = groupAhspCategories([
      item('CIPTA_KARYA', 'Pekerjaan Tanah', 'CK.1'),
      item('SUMBER_DAYA_AIR', 'Pekerjaan Tanah', 'SDA.1'),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].categories[0].key).toBe('CIPTA_KARYA::Pekerjaan Tanah');
    expect(groups[1].categories[0].key).toBe('SUMBER_DAYA_AIR::Pekerjaan Tanah');
  });

  it('input kosong -> tidak ada grup; grup CUSTOM hanya bila ada item custom', () => {
    expect(groupAhspCategories([])).toEqual([]);
    const groups = groupAhspCategories([item('BINA_MARGA', 'BINA_MARGA', 'C.37')]);
    expect(groups.map((g) => g.domain)).toEqual(['BINA_MARGA']);
  });
});

describe('groupAhspCategories — katalog resmi', () => {
  // JUMLAH KANONIS (dibuktikan dari source, perbaikan pin 2026-11-14):
  // backing ALL_OFFICIAL_AHSP_ITEMS = 5.742; karantina = 17 entri
  // (ahspQuarantine.ts — 10 Cipta Karya + 7 Bina Marga E.2–E.8, semuanya
  // ada di backing); aktif = 5.742 − 17 = 5.725.
  // Per-domain aktif: CK 2.849, BM 1.130 (= 1.137 backing − 7 karantina),
  // SDA 1.556, SMKK 190. Pin lama (total 5.732, BM 1.137) SALAH SEJAK
  // DITULIS: pin BM memakai jumlah backing master (komentar
  // masterRegistry.ts "1137 items"), bukan jumlah aktif — 7 item korup
  // E.2–E.8 sudah dikarantina 70 menit sebelum pin ditulis (e324e17
  // 02:19 → pin 7c9ef1e 03:29, 2026-10-27) dan kelima berkas data
  // byte-identik sejak itu. Kode repository + groupAhspCategories BENAR
  // (kontrak: aktif = backing − karantina); yang diperbaiki hanya pin.
  it('4 domain resmi ada, CUSTOM kosong, total 5725, tanpa tabrakan nama kategori antar domain', () => {
    const items = officialAhspRepository.getActiveOfficialAhsp();
    const groups = groupAhspCategories(items);
    expect(groups.map((g) => g.domain)).toEqual([
      'CIPTA_KARYA',
      'BINA_MARGA',
      'SUMBER_DAYA_AIR',
      'SMKK',
    ]);
    expect(groups.reduce((sum, g) => sum + g.total, 0)).toBe(5725);
    const totals = new Map(groups.map((g) => [g.domain, g.total]));
    expect(totals.get('CIPTA_KARYA')).toBe(2849);
    expect(totals.get('BINA_MARGA')).toBe(1130);
    expect(totals.get('SUMBER_DAYA_AIR')).toBe(1556);
    expect(totals.get('SMKK')).toBe(190);
    // Bukti kunci `domain::category` aman: tidak ada nama kategori yang
    // dipakai dua domain berbeda di katalog resmi.
    const seen = new Map<string, string>();
    for (const it of items) {
      const prev = seen.get(it.category);
      if (prev && prev !== it.domain) {
        throw new Error(`kategori ${it.category} dipakai ${prev} dan ${it.domain}`);
      }
      seen.set(it.category, it.domain);
    }
    expect(seen.size).toBe(38);
  });
});

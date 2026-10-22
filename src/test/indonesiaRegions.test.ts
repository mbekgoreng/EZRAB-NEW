/**
 * Basis data wilayah Indonesia + resolusi indeks harga regional.
 * Jalankan: npx vitest run src/test/indonesiaRegions.test.ts
 *
 * Angka acuan: 38 provinsi; 514 kabupaten/kota = 416 kabupaten + 98 kota
 * (daftar Kemendagri pasca pemekaran Papua 2022).
 */
import { describe, it, expect } from 'vitest';
import {
  INDONESIA_PROVINCES,
  listProvinces,
  listRegencies,
  findRegency,
  findProvinceByName,
  formatLocation,
  parseFormattedLocation,
  resolveProvinceFromLocation,
  resolveRegionIndex,
  ENGINE_DEFAULT_REGION,
} from '../data/indonesiaRegions';
import { REGIONAL_PRICE_INDICES } from '../engine/parametricVolumeEngine/parametricVolumeEngine';

describe('integritas data wilayah', () => {
  it('38 provinsi, 514 kabupaten/kota (416 kabupaten + 98 kota)', () => {
    expect(INDONESIA_PROVINCES.length).toBe(38);
    let kab = 0;
    let kota = 0;
    for (const p of INDONESIA_PROVINCES) {
      for (const r of p.regencies) {
        if (r.type === 'kabupaten') kab++;
        else kota++;
      }
    }
    expect(kab).toBe(416);
    expect(kota).toBe(98);
    expect(kab + kota).toBe(514);
  });

  it('tidak ada nama ganda (nama+tipe) dalam satu provinsi; nama provinsi unik', () => {
    const provNames = new Set<string>();
    for (const p of INDONESIA_PROVINCES) {
      expect(provNames.has(p.name)).toBe(false);
      provNames.add(p.name);
      const seen = new Set<string>();
      for (const r of p.regencies) {
        const key = `${r.type}:${r.name.toLowerCase()}`;
        expect(seen.has(key), `${p.name}/${key}`).toBe(false);
        seen.add(key);
        expect(r.name.length).toBeGreaterThan(0);
        // Nama kabupaten tidak membawa awalan "Kabupaten"
        expect(r.name.toLowerCase().startsWith('kabupaten ')).toBe(false);
      }
    }
  });

  it('jumlah per provinsi kunci cocok (Jabar 27, Jatim 38, DKI 6, Papua Selatan 4)', () => {
    expect(listRegencies('Jawa Barat').length).toBe(27);
    expect(listRegencies('Jawa Timur').length).toBe(38);
    expect(listRegencies('DKI Jakarta').length).toBe(6);
    expect(listRegencies('Papua Selatan').length).toBe(4);
    expect(listProvinces().length).toBe(38);
  });
});

describe('helper pencarian', () => {
  it('"bogor" menemukan Kabupaten Bogor & Kota Bogor di Jawa Barat', () => {
    const m = findRegency('bogor');
    expect(m.length).toBe(2);
    expect(m.every((x) => x.province === 'Jawa Barat')).toBe(true);
    expect(m.map((x) => x.regency.type).sort()).toEqual(['kabupaten', 'kota']);
  });

  it('awalan "Kab."/"Kota" pada query ditoleransi', () => {
    const kab = findRegency('Kab. Bogor');
    expect(kab.some((x) => x.regency.type === 'kabupaten' && x.regency.name === 'Bogor')).toBe(true);
    const kota = findRegency('Kota Bogor');
    expect(kota.some((x) => x.regency.type === 'kota' && x.regency.name === 'Bogor')).toBe(true);
    const kab2 = findRegency('Kabupaten Bogor');
    expect(kab2.some((x) => x.regency.type === 'kabupaten')).toBe(true);
  });

  it('"jayapura" berada di Papua (kabupaten + kota)', () => {
    const m = findRegency('jayapura');
    expect(m.length).toBe(2);
    expect(m.every((x) => x.province === 'Papua')).toBe(true);
  });

  it('findProvinceByName tak peka huruf; provinsi tak dikenal → null/kosong', () => {
    expect(findProvinceByName('jawa barat')?.name).toBe('Jawa Barat');
    expect(findProvinceByName('Narnia')).toBeNull();
    expect(listRegencies('Narnia')).toEqual([]);
    expect(findRegency('')).toEqual([]);
  });
});

describe('formatLocation & parseFormattedLocation', () => {
  it('kabupaten → "Kabupaten X, Provinsi Y"; kota → "Kota X, Provinsi Y"', () => {
    expect(formatLocation('Jawa Barat', 'Bogor')).toBe('Kabupaten Bogor, Provinsi Jawa Barat');
    expect(formatLocation('Jawa Barat', { name: 'Bogor', type: 'kota' })).toBe(
      'Kota Bogor, Provinsi Jawa Barat',
    );
    expect(formatLocation('Papua', { name: 'Jayapura', type: 'kota' })).toBe(
      'Kota Jayapura, Provinsi Papua',
    );
  });

  it('round-trip format → parse menghasilkan wilayah yang sama', () => {
    const s = formatLocation('Jawa Timur', { name: 'Surabaya', type: 'kota' });
    const parsed = parseFormattedLocation(s);
    expect(parsed?.province).toBe('Jawa Timur');
    expect(parsed?.regency).toEqual({ name: 'Surabaya', type: 'kota' });
    expect(parseFormattedLocation('jawa')).toBeNull();
    expect(parseFormattedLocation('Jakarta Selatan')).toBeNull();
  });
});

describe('resolveProvinceFromLocation', () => {
  it('nama kabupaten/kota & string gabungan teresolusi ke provinsinya', () => {
    expect(resolveProvinceFromLocation('Bogor')).toBe('Jawa Barat');
    expect(resolveProvinceFromLocation('Bandung')).toBe('Jawa Barat');
    expect(resolveProvinceFromLocation('Kabupaten Bogor, Provinsi Jawa Barat')).toBe('Jawa Barat');
    expect(resolveProvinceFromLocation('Jakarta Selatan')).toBe('DKI Jakarta');
    expect(resolveProvinceFromLocation('BSD City, Tangerang Selatan')).toBe('Banten');
    expect(resolveProvinceFromLocation('Surabaya')).toBe('Jawa Timur');
    expect(resolveProvinceFromLocation(null)).toBeNull();
    expect(resolveProvinceFromLocation('')).toBeNull();
  });
});

describe('resolveRegionIndex', () => {
  it('provinsi berindeks → nilai dari REGIONAL_PRICE_INDICES, bukan fallback', () => {
    const jabar = resolveRegionIndex('Jawa Barat');
    expect(jabar.region).toBe('Jawa Barat');
    expect(jabar.index).toBe(REGIONAL_PRICE_INDICES['Jawa Barat']);
    expect(jabar.index).toBe(0.95);
    expect(jabar.isFallback).toBe(false);

    const papua = resolveRegionIndex('Papua Pegunungan');
    expect(papua.index).toBe(1.6);
    expect(papua.isFallback).toBe(false);
  });

  it('nama resmi yang berbeda dari kunci engine tetap teresolusi (bukan fallback)', () => {
    const babel = resolveRegionIndex('Kepulauan Bangka Belitung');
    expect(babel.region).toBe('Bangka Belitung');
    expect(babel.index).toBe(REGIONAL_PRICE_INDICES['Bangka Belitung']);
    expect(babel.isFallback).toBe(false);

    const diy = resolveRegionIndex('Daerah Istimewa Yogyakarta');
    expect(diy.region).toBe('DI Yogyakarta');
    expect(diy.index).toBe(0.89);
    expect(diy.isFallback).toBe(false);
  });

  it('provinsi tanpa indeks (Aceh) → fallback BERTANDA dengan indeks dasar engine', () => {
    const aceh = resolveRegionIndex('Aceh');
    expect(aceh.isFallback).toBe(true);
    expect(aceh.region).toBe(ENGINE_DEFAULT_REGION);
    expect(aceh.index).toBe(REGIONAL_PRICE_INDICES[ENGINE_DEFAULT_REGION]);
    expect(aceh.index).toBe(1.0);
  });

  it('kabupaten mewarisi indeks provinsinya', () => {
    const m = findRegency('Sleman');
    expect(m.length).toBe(1);
    const r = resolveRegionIndex(m[0].province);
    expect(r.index).toBe(REGIONAL_PRICE_INDICES['DI Yogyakarta']);
    expect(r.isFallback).toBe(false);
  });
});

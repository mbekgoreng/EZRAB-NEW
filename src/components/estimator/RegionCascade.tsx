/**
 * RegionCascade — pemilih wilayah bertingkat untuk Informasi Proyek:
 * Provinsi → Kabupaten/Kota → Kecamatan → Desa/Kelurahan, seluruhnya
 * dari database wilayah asli (src/data/wilayah.ts, kode Kemendagri).
 *
 * Kontrak dengan ProjectInfoTab: bekerja di atas `values` Record yang
 * sama dengan field lain. Kunci nama: province, cityRegency, district,
 * village. Kunci kode: provinceCode, regencyCode, districtCode,
 * villageCode. Mengganti satu tingkat mengosongkan seluruh tingkat di
 * bawahnya (nama + kode) agar tidak ada kombinasi wilayah yang mustahil
 * tersimpan.
 *
 * Nilai lama (teks bebas, sebelum ada pemilih): dicocokkan ke database
 * lewat kode bila ada, atau lewat nama. Bila teks lama TIDAK cocok
 * dengan entri mana pun, teks itu ditampilkan apa adanya sebagai opsi
 * terpilih bertanda "(teks lama)" — tidak pernah dibuang diam-diam;
 * pengguna menggantinya dengan memilih dari daftar.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  getProvinces,
  getRegencies,
  getDistricts,
  getVillages,
  findProvince,
  findRegency,
  findDistrict,
  findVillage,
  matchProvinceByName,
  matchRegencyByName,
  matchDistrictByName,
  matchVillageByName,
} from '../../data/wilayah';
import type { WilayahChildEntry, WilayahEntry } from '../../data/wilayah';

interface RegionCascadeProps {
  values: Record<string, string>;
  set: (key: string, value: string) => void;
}

const selectStyle: React.CSSProperties = {
  width: '100%',
  height: '38px',
  borderRadius: '10px',
  border: '1px solid var(--ez-color-border-strong)',
  background: 'var(--ez-color-surface)',
  color: 'var(--ez-color-text-primary)',
  fontSize: '13px',
  padding: '0 12px',
  marginTop: '6px',
  fontFamily: 'inherit',
};

const labelStyle: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 600,
  color: 'var(--ez-color-text-body)',
};

export const RegionCascade: React.FC<RegionCascadeProps> = ({ values, set }) => {
  const [villages, setVillages] = useState<WilayahChildEntry[]>([]);
  const [villageName, setVillageName] = useState<string>('');
  const [loadingVillages, setLoadingVillages] = useState(false);

  /* Resolusi pilihan saat ini: kode dulu, lalu cocokkan nama lama. */
  const province: WilayahEntry | undefined = useMemo(() => {
    if (values.provinceCode) return findProvince(values.provinceCode);
    return values.province ? matchProvinceByName(values.province) : undefined;
  }, [values.provinceCode, values.province]);

  const regency: WilayahChildEntry | undefined = useMemo(() => {
    if (values.regencyCode) return findRegency(values.regencyCode);
    return values.cityRegency
      ? matchRegencyByName(values.cityRegency, province?.code)
      : undefined;
  }, [values.regencyCode, values.cityRegency, province?.code]);

  const district: WilayahChildEntry | undefined = useMemo(() => {
    if (values.districtCode) return findDistrict(values.districtCode);
    return values.district && regency
      ? matchDistrictByName(values.district, regency.code)
      : undefined;
  }, [values.districtCode, values.district, regency?.code]);

  const regencies = useMemo(
    () => (province ? getRegencies(province.code) : []),
    [province?.code] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const districts = useMemo(
    () => (regency ? getDistricts(regency.code) : []),
    [regency?.code] // eslint-disable-line react-hooks/exhaustive-deps
  );

  /* Desa dimuat malas (JSON 3,5 MB diimpor dinamis oleh data/wilayah). */
  useEffect(() => {
    if (!district) {
      setVillages([]);
      return;
    }
    let alive = true;
    setLoadingVillages(true);
    getVillages(district.code).then((list) => {
      if (!alive) return;
      setVillages(list);
      setLoadingVillages(false);
    });
    return () => {
      alive = false;
    };
  }, [district?.code]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Nama desa terpilih: dari kode, atau cocokkan nama lama. */
  useEffect(() => {
    let alive = true;
    const resolve = async () => {
      if (values.villageCode) {
        const v = await findVillage(values.villageCode);
        if (alive) setVillageName(v?.name ?? values.village ?? '');
        return;
      }
      if (values.village && district) {
        const v = await matchVillageByName(values.village, district.code);
        if (alive) setVillageName(v?.name ?? values.village);
        return;
      }
      if (alive) setVillageName(values.village ?? '');
    };
    resolve();
    return () => {
      alive = false;
    };
  }, [values.villageCode, values.village, district?.code]); // eslint-disable-line react-hooks/exhaustive-deps

  const clearBelow = (level: 'province' | 'regency' | 'district') => {
    if (level === 'province') {
      set('cityRegency', ''); set('regencyCode', '');
      set('district', ''); set('districtCode', '');
      set('village', ''); set('villageCode', '');
    } else if (level === 'regency') {
      set('district', ''); set('districtCode', '');
      set('village', ''); set('villageCode', '');
    } else {
      set('village', ''); set('villageCode', '');
    }
  };

  /* Opsi warisan: teks lama yang tidak cocok dengan database tetap
   * ditampilkan sebagai nilai terpilih agar tidak hilang. */
  const legacyOption = (current: string, resolved?: { name: string }) =>
    current && (!resolved || resolved.name !== current) ? current : null;

  const provinceLegacy = legacyOption(values.province ?? '', province);
  const regencyLegacy = legacyOption(values.cityRegency ?? '', regency);
  const districtLegacy = legacyOption(values.district ?? '', district);
  const villageResolved = villages.find((v) => v.code === values.villageCode)
    ?? (villageName && villages.some((v) => v.name === villageName)
      ? villages.find((v) => v.name === villageName)
      : undefined);
  const villageLegacy = legacyOption(values.village ?? '', villageResolved);

  return (
    <>
      <div>
        <label style={labelStyle}>
          Provinsi <span style={{ color: '#DC2626' }}>*</span>
        </label>
        <select
          style={selectStyle}
          value={province?.code ?? (provinceLegacy ? '__legacy__' : '')}
          onChange={(e) => {
            const p = getProvinces().find((x) => x.code === e.target.value);
            clearBelow('province');
            if (p) {
              set('province', p.name);
              set('provinceCode', p.code);
            }
          }}
        >
          <option value="" disabled>Pilih provinsi…</option>
          {provinceLegacy && <option value="__legacy__">{provinceLegacy} (teks lama)</option>}
          {getProvinces().map((p) => (
            <option key={p.code} value={p.code}>{p.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label style={labelStyle}>
          Kabupaten/Kota <span style={{ color: '#DC2626' }}>*</span>
        </label>
        <select
          style={selectStyle}
          value={regency?.code ?? (regencyLegacy ? '__legacy__' : '')}
          disabled={!province}
          onChange={(e) => {
            const r = regencies.find((x) => x.code === e.target.value);
            clearBelow('regency');
            if (r) {
              set('cityRegency', r.name);
              set('regencyCode', r.code);
            }
          }}
        >
          <option value="" disabled>{province ? 'Pilih kabupaten/kota…' : 'Pilih provinsi dulu'}</option>
          {regencyLegacy && <option value="__legacy__">{regencyLegacy} (teks lama)</option>}
          {regencies.map((r) => (
            <option key={r.code} value={r.code}>{r.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label style={labelStyle}>Kecamatan (opsional)</label>
        <select
          style={selectStyle}
          value={district?.code ?? (districtLegacy ? '__legacy__' : '')}
          disabled={!regency}
          onChange={(e) => {
            const d = districts.find((x) => x.code === e.target.value);
            clearBelow('district');
            if (d) {
              set('district', d.name);
              set('districtCode', d.code);
            }
          }}
        >
          <option value="" disabled>{regency ? 'Pilih kecamatan…' : 'Pilih kabupaten/kota dulu'}</option>
          {districtLegacy && <option value="__legacy__">{districtLegacy} (teks lama)</option>}
          {districts.map((d) => (
            <option key={d.code} value={d.code}>{d.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label style={labelStyle}>Desa/Kelurahan (opsional)</label>
        <select
          style={selectStyle}
          value={villageResolved?.code ?? (villageLegacy ? '__legacy__' : '')}
          disabled={!district || loadingVillages}
          onChange={(e) => {
            const v = villages.find((x) => x.code === e.target.value);
            if (v) {
              set('village', v.name);
              set('villageCode', v.code);
            }
          }}
        >
          <option value="" disabled>
            {!district ? 'Pilih kecamatan dulu' : loadingVillages ? 'Memuat desa…' : 'Pilih desa/kelurahan…'}
          </option>
          {villageLegacy && <option value="__legacy__">{villageLegacy} (teks lama)</option>}
          {villages.map((v) => (
            <option key={v.code} value={v.code}>{v.name}</option>
          ))}
        </select>
      </div>
    </>
  );
};

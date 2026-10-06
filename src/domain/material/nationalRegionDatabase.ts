/**
 * EZRAB — NATIONAL REGION DATABASE INDONESIA 2026
 * Comprehensive Geographic Hierarchy & Regional Cost Multipliers (IKK 2026)
 * Covers all 38 Provinces of Indonesia + Regencies/Cities
 */

import { RegionMaster } from './types';

export interface ProvinceDetail {
  code: string;
  name: string;
  island: string;
  defaultCostIndexVsJakarta: number;
  regenciesAndCities: string[];
}

export const INDONESIA_38_PROVINCES: ProvinceDetail[] = [
  // ----------------- SUMATERA (10 Provinsi) -----------------
  {
    code: 'ID-AC',
    name: 'Aceh',
    island: 'Sumatera',
    defaultCostIndexVsJakarta: 1.15,
    regenciesAndCities: [
      'Banda Aceh', 'Sabang', 'Lhokseumawe', 'Langsa', 'Subulussalam',
      'Aceh Besar', 'Aceh Pidie', 'Pidie Jaya', 'Bireuen', 'Aceh Utara',
      'Aceh Timur', 'Aceh Tamiang', 'Bener Meriah', 'Aceh Tengah',
      'Gayo Lues', 'Aceh Tenggara', 'Aceh Barat', 'Nagan Raya',
      'Aceh Barat Daya', 'Aceh Selatan', 'Aceh Singkil', 'Simeulue', 'Aceh Jaya'
    ]
  },
  {
    code: 'ID-SU',
    name: 'Sumatera Utara',
    island: 'Sumatera',
    defaultCostIndexVsJakarta: 1.10,
    regenciesAndCities: [
      'Medan', 'Binjai', 'Pematangsiantar', 'Tanjungbalai', 'Tebing Tinggi',
      'Sibolga', 'Padangsidimpuan', 'Gunungsitoli', 'Deli Serdang', 'Karo',
      'Simalungun', 'Asahan', 'Labuhanbatu', 'Tapanuli Utara', 'Toba', 'Nias'
    ]
  },
  {
    code: 'ID-SB',
    name: 'Sumatera Barat',
    island: 'Sumatera',
    defaultCostIndexVsJakarta: 1.08,
    regenciesAndCities: [
      'Padang', 'Bukittinggi', 'Payakumbuh', 'Solok', 'Sawahlunto',
      'Padang Panjang', 'Pariaman', 'Agam', 'Tanah Datar', 'Pasaman', 'Pesisir Selatan'
    ]
  },
  {
    code: 'ID-RI',
    name: 'Riau',
    island: 'Sumatera',
    defaultCostIndexVsJakarta: 1.12,
    regenciesAndCities: [
      'Pekanbaru', 'Dumai', 'Kampar', 'Siak', 'Pelalawan', 'Bengkalis',
      'Rokan Hulu', 'Rokan Hilir', 'Indragiri Hulu', 'Indragiri Hilir', 'Kuantan Singingi', 'Kepulauan Meranti'
    ]
  },
  {
    code: 'ID-KR',
    name: 'Kepulauan Riau',
    island: 'Sumatera',
    defaultCostIndexVsJakarta: 1.18,
    regenciesAndCities: [
      'Batam', 'Tanjungpinang', 'Bintan', 'Karimun', 'Natuna', 'Anambas', 'Lingga'
    ]
  },
  {
    code: 'ID-JA',
    name: 'Jambi',
    island: 'Sumatera',
    defaultCostIndexVsJakarta: 1.09,
    regenciesAndCities: [
      'Jambi', 'Sungai Penuh', 'Muaro Jambi', 'Batanghari', 'Tanjung Jabung Barat',
      'Tanjung Jabung Timur', 'Bungo', 'Tebo', 'Merangin', 'Sarolangun', 'Kerinci'
    ]
  },
  {
    code: 'ID-SS',
    name: 'Sumatera Selatan',
    island: 'Sumatera',
    defaultCostIndexVsJakarta: 1.08,
    regenciesAndCities: [
      'Palembang', 'Prabumulih', 'Lubuklinggau', 'Pagar Alam', 'Ogan Ilir',
      'Ogan Komering Ilir', 'Banyuasin', 'Musi Banyuasin', 'Muara Enim', 'Lahat'
    ]
  },
  {
    code: 'ID-BB',
    name: 'Kepulauan Bangka Belitung',
    island: 'Sumatera',
    defaultCostIndexVsJakarta: 1.14,
    regenciesAndCities: [
      'Pangkalpinang', 'Bangka', 'Bangka Barat', 'Bangka Tengah', 'Bangka Selatan', 'Belitung', 'Belitung Timur'
    ]
  },
  {
    code: 'ID-BE',
    name: 'Bengkulu',
    island: 'Sumatera',
    defaultCostIndexVsJakarta: 1.10,
    regenciesAndCities: [
      'Bengkulu', 'Bengkulu Utara', 'Bengkulu Selatan', 'Rejang Lebong', 'Mukomuko', 'Seluma', 'Kaur'
    ]
  },
  {
    code: 'ID-LA',
    name: 'Lampung',
    island: 'Sumatera',
    defaultCostIndexVsJakarta: 1.05,
    regenciesAndCities: [
      'Bandar Lampung', 'Metro', 'Lampung Selatan', 'Lampung Tengah', 'Lampung Timur',
      'Lampung Utara', 'Pesawaran', 'Pringsewu', 'Tanggamus', 'Tulang Bawang'
    ]
  },

  // ----------------- JAWA (6 Provinsi) -----------------
  {
    code: 'ID-JK',
    name: 'DKI Jakarta',
    island: 'Jawa',
    defaultCostIndexVsJakarta: 1.00,
    regenciesAndCities: [
      'Jakarta Pusat', 'Jakarta Selatan', 'Jakarta Barat', 'Jakarta Timur', 'Jakarta Utara', 'Kepulauan Seribu'
    ]
  },
  {
    code: 'ID-JB',
    name: 'Jawa Barat',
    island: 'Jawa',
    defaultCostIndexVsJakarta: 0.96,
    regenciesAndCities: [
      'Bandung', 'Bekasi', 'Bogor', 'Depok', 'Cimahi', 'Cirebon', 'Sukabumi', 'Tasikmalaya', 'Banjar',
      'Karawang', 'Purwakarta', 'Subang', 'Indramayu', 'Majalengka', 'Kuningan', 'Ciamis',
      'Garut', 'Cianjur', 'Bandung Barat', 'Pangandaran'
    ]
  },
  {
    code: 'ID-BT',
    name: 'Banten',
    island: 'Jawa',
    defaultCostIndexVsJakarta: 0.98,
    regenciesAndCities: [
      'Tangerang', 'Tangerang Selatan', 'Serang', 'Cilegon', 'Lebak', 'Pandeglang'
    ]
  },
  {
    code: 'ID-JT',
    name: 'Jawa Tengah',
    island: 'Jawa',
    defaultCostIndexVsJakarta: 0.90,
    regenciesAndCities: [
      'Semarang', 'Surakarta (Solo)', 'Magelang', 'Pekalongan', 'Salatiga', 'Tegal',
      'Banyumas (Purwokerto)', 'Cilacap', 'Kudus', 'Jepara', 'Pati', 'Klaten',
      'Sukoharjo', 'Boyolali', 'Sragen', 'Karanganyar', 'Wonosobo', 'Temanggung',
      'Kendal', 'Batang', 'Brebes', 'Kebumen', 'Purworejo', 'Blora', 'Rembang'
    ]
  },
  {
    code: 'ID-YO',
    name: 'D.I. Yogyakarta',
    island: 'Jawa',
    defaultCostIndexVsJakarta: 0.92,
    regenciesAndCities: [
      'Yogyakarta', 'Sleman', 'Bantul', 'Kulon Progo', 'Gunungkidul'
    ]
  },
  {
    code: 'ID-JI',
    name: 'Jawa Timur',
    island: 'Jawa',
    defaultCostIndexVsJakarta: 0.94,
    regenciesAndCities: [
      'Surabaya', 'Malang', 'Sidoarjo', 'Gresik', 'Pasuruan', 'Probolinggo', 'Mojokerto',
      'Kediri', 'Blitar', 'Madiun', 'Batu', 'Banyuwangi', 'Jember', 'Lumajang', 'Bondowoso',
      'Situbondo', 'Tuban', 'Lamongan', 'Bojonegoro', 'Ngawi', 'Magetan', 'Ponorogo',
      'Pacitan', 'Trenggalek', 'Tulungagung', 'Nganjuk', 'Jombang', 'Bangkalan', 'Sampang', 'Pamekasan', 'Sumenep'
    ]
  },

  // ----------------- BALI & NUSA TENGGARA (3 Provinsi) -----------------
  {
    code: 'ID-BA',
    name: 'Bali',
    island: 'Bali & Nusa Tenggara',
    defaultCostIndexVsJakarta: 1.06,
    regenciesAndCities: [
      'Denpasar', 'Badung', 'Gianyar', 'Tabanan', 'Buleleng', 'Klungkung', 'Karangasem', 'Bangli', 'Jembrana'
    ]
  },
  {
    code: 'ID-NB',
    name: 'Nusa Tenggara Barat',
    island: 'Bali & Nusa Tenggara',
    defaultCostIndexVsJakarta: 1.10,
    regenciesAndCities: [
      'Mataram', 'Bima', 'Lombok Barat', 'Lombok Tengah', 'Lombok Timur', 'Lombok Utara', 'Sumbawa', 'Sumbawa Barat', 'Dompu'
    ]
  },
  {
    code: 'ID-NT',
    name: 'Nusa Tenggara Timur',
    island: 'Bali & Nusa Tenggara',
    defaultCostIndexVsJakarta: 1.25,
    regenciesAndCities: [
      'Kupang', 'Manggarai Barat (Labuan Bajo)', 'Manggarai', 'Flores Timur', 'Sikka', 'Ende', 'Ngada', 'Alor', 'Sumba Timur', 'Sumba Barat'
    ]
  },

  // ----------------- KALIMANTAN (5 Provinsi) -----------------
  {
    code: 'ID-KB',
    name: 'Kalimantan Barat',
    island: 'Kalimantan',
    defaultCostIndexVsJakarta: 1.16,
    regenciesAndCities: [
      'Pontianak', 'Singkawang', 'Kubu Raya', 'Mempawah', 'Sambas', 'Ketapang', 'Sintang', 'Kapuas Hulu'
    ]
  },
  {
    code: 'ID-KT',
    name: 'Kalimantan Tengah',
    island: 'Kalimantan',
    defaultCostIndexVsJakarta: 1.18,
    regenciesAndCities: [
      'Palangka Raya', 'Kotawaringin Barat', 'Kotawaringin Timur', 'Kapuas', 'Barito Selatan', 'Barito Utara', 'Katingan'
    ]
  },
  {
    code: 'ID-KS',
    name: 'Kalimantan Selatan',
    island: 'Kalimantan',
    defaultCostIndexVsJakarta: 1.14,
    regenciesAndCities: [
      'Banjarmasin', 'Banjarbaru', 'Banjar', 'Barito Kuala', 'Tanah Laut', 'Tanah Bumbu', 'Kotabaru', 'Tabalong'
    ]
  },
  {
    code: 'ID-KI',
    name: 'Kalimantan Timur (termasuk IKN Nusantara)',
    island: 'Kalimantan',
    defaultCostIndexVsJakarta: 1.22,
    regenciesAndCities: [
      'Balikpapan', 'Samarinda', 'Bontang', 'IKN Nusantara', 'Penajam Paser Utara', 'Kutai Kartanegara', 'Kutai Timur', 'Kutai Barat', 'Berau', 'Paser'
    ]
  },
  {
    code: 'ID-KU',
    name: 'Kalimantan Utara',
    island: 'Kalimantan',
    defaultCostIndexVsJakarta: 1.26,
    regenciesAndCities: [
      'Tarakan', 'Bulungan', 'Nunukan', 'Malinau', 'Tana Tidung'
    ]
  },

  // ----------------- SULAWESI (6 Provinsi) -----------------
  {
    code: 'ID-SA',
    name: 'Sulawesi Utara',
    island: 'Sulawesi',
    defaultCostIndexVsJakarta: 1.16,
    regenciesAndCities: [
      'Manado', 'Bitung', 'Tomohon', 'Kotamobagu', 'Minahasa', 'Minahasa Utara', 'Minahasa Selatan', 'Bolaang Mongondow', 'Kepulauan Sangihe'
    ]
  },
  {
    code: 'ID-GO',
    name: 'Gorontalo',
    island: 'Sulawesi',
    defaultCostIndexVsJakarta: 1.15,
    regenciesAndCities: [
      'Gorontalo', 'Gorontalo Utara', 'Bone Bolango', 'Boalemo', 'Pohuwato'
    ]
  },
  {
    code: 'ID-ST',
    name: 'Sulawesi Tengah',
    island: 'Sulawesi',
    defaultCostIndexVsJakarta: 1.18,
    regenciesAndCities: [
      'Palu', 'Donggala', 'Parigi Moutong', 'Poso', 'Morowali', 'Morowali Utara', 'Banggai', 'Tolitoli', 'Buol'
    ]
  },
  {
    code: 'ID-SR',
    name: 'Sulawesi Barat',
    island: 'Sulawesi',
    defaultCostIndexVsJakarta: 1.17,
    regenciesAndCities: [
      'Mamuju', 'Majene', 'Polewali Mandar', 'Mamasa', 'Pasangkayu', 'Mamuju Tengah'
    ]
  },
  {
    code: 'ID-SN',
    name: 'Sulawesi Selatan',
    island: 'Sulawesi',
    defaultCostIndexVsJakarta: 1.12,
    regenciesAndCities: [
      'Makassar', 'Parepare', 'Palopo', 'Gowa', 'Maros', 'Pangkajene Kepulauan', 'Barru', 'Bone', 'Soppeng', 'Wajo', 'Luwu', 'Tana Toraja'
    ]
  },
  {
    code: 'ID-SG',
    name: 'Sulawesi Tenggara',
    island: 'Sulawesi',
    defaultCostIndexVsJakarta: 1.17,
    regenciesAndCities: [
      'Kendari', 'Baubau', 'Konawe', 'Konawe Selatan', 'Konawe Utara', 'Kolaka', 'Muna', 'Buton', 'Wakatobi'
    ]
  },

  // ----------------- MALUKU & PAPUA (8 Provinsi) -----------------
  {
    code: 'ID-MA',
    name: 'Maluku',
    island: 'Maluku',
    defaultCostIndexVsJakarta: 1.35,
    regenciesAndCities: [
      'Ambon', 'Tual', 'Maluku Tengah', 'Maluku Tenggara', 'Buru', 'Seram Bagian Barat', 'Seram Bagian Timur', 'Kepulauan Aru'
    ]
  },
  {
    code: 'ID-MU',
    name: 'Maluku Utara',
    island: 'Maluku',
    defaultCostIndexVsJakarta: 1.32,
    regenciesAndCities: [
      'Ternate', 'Tidore Kepulauan', 'Halmahera Barat', 'Halmahera Utara', 'Halmahera Selatan', 'Halmahera Tengah', 'Halmahera Timur', 'Pulau Morotai'
    ]
  },
  {
    code: 'ID-PA',
    name: 'Papua',
    island: 'Papua',
    defaultCostIndexVsJakarta: 1.48,
    regenciesAndCities: [
      'Jayapura', 'Keerom', 'Sarmi', 'Mamberamo Raya', 'Biak Numfor', 'Supiori', 'Kepulauan Yapen', 'Waropen'
    ]
  },
  {
    code: 'ID-PB',
    name: 'Papua Barat',
    island: 'Papua',
    defaultCostIndexVsJakarta: 1.45,
    regenciesAndCities: [
      'Manokwari', 'Manokwari Selatan', 'Pegunungan Arfak', 'Teluk Bintuni', 'Teluk Wondama', 'Fakfak', 'Kaimana'
    ]
  },
  {
    code: 'ID-PS',
    name: 'Papua Selatan',
    island: 'Papua',
    defaultCostIndexVsJakarta: 1.50,
    regenciesAndCities: [
      'Merauke', 'Boven Digoel', 'Mappi', 'Asmat'
    ]
  },
  {
    code: 'ID-PT',
    name: 'Papua Tengah',
    island: 'Papua',
    defaultCostIndexVsJakarta: 1.60,
    regenciesAndCities: [
      'Nabire', 'Mimika (Timika)', 'Paniai', 'Deiyai', 'Dogiyai', 'Intan Jaya', 'Puncak', 'Puncak Jaya'
    ]
  },
  {
    code: 'ID-PE',
    name: 'Papua Pegunungan',
    island: 'Papua',
    defaultCostIndexVsJakarta: 1.85, // Akses pegunungan & angkutan udara
    regenciesAndCities: [
      'Jayawijaya (Wamena)', 'Lanny Jaya', 'Mamberamo Tengah', 'Nduga', 'Tolikara', 'Yahukimo', 'Yalimo', 'Pegunungan Bintang'
    ]
  },
  {
    code: 'ID-PD',
    name: 'Papua Barat Daya',
    island: 'Papua',
    defaultCostIndexVsJakarta: 1.42,
    regenciesAndCities: [
      'Sorong', 'Raja Ampat', 'Sorong Selatan', 'Maybrat', 'Tambrauw'
    ]
  }
];

export class NationalRegionService {
  private static instance: NationalRegionService;
  private regionMasters: Map<string, RegionMaster> = new Map();

  private constructor() {
    this.buildRegionIndex();
  }

  public static getInstance(): NationalRegionService {
    if (!NationalRegionService.instance) {
      NationalRegionService.instance = new NationalRegionService();
    }
    return NationalRegionService.instance;
  }

  public static getAllRegions(): RegionMaster[] {
    return NationalRegionService.getInstance().getAllRegions();
  }

  public static findRegion(query: string | { province?: string; city?: string; regency?: string }): import('./types').RegionHierarchy | undefined {
    const service = NationalRegionService.getInstance();
    let qObj: { province?: string; city?: string; regency?: string };

    if (typeof query === 'string') {
      const q = query.trim();
      qObj = { city: q, province: q };
    } else {
      qObj = query;
    }

    const res = service.findRegion(qObj);
    if (!res || !res.matchedRegion) return undefined;

    return {
      country: 'Indonesia',
      province: res.matchedRegion.province,
      city: res.matchedRegion.type === 'KOTA' ? res.matchedRegion.regencyOrCity : undefined,
      regency: res.matchedRegion.type === 'KABUPATEN' ? res.matchedRegion.regencyOrCity : undefined,
    };
  }

  private buildRegionIndex(): void {
    for (const prov of INDONESIA_38_PROVINCES) {
      // Province level entry
      const provId = `REG-${prov.code}`;
      this.regionMasters.set(provId, {
        id: provId,
        code: prov.code,
        name: prov.name,
        province: prov.name,
        regencyOrCity: prov.name,
        type: 'PROVINSI',
        costIndexVsJakarta: prov.defaultCostIndexVsJakarta,
        provincesOrCities: [prov.name.toLowerCase()],
      });

      // City & Regency level entries
      for (const city of prov.regenciesAndCities) {
        const cleanName = city.replace(/^(Kabupaten|Kota|Kab\.|Kodya)\s+/i, '').trim();
        const cityId = `REG-${prov.code}-${cleanName.replace(/\s+/g, '_').toUpperCase().slice(0, 10)}`;
        const isCity = city.toLowerCase().startsWith('kota') || !city.toLowerCase().includes('kabupaten');

        this.regionMasters.set(cityId, {
          id: cityId,
          code: `${prov.code}-${cleanName.slice(0, 3).toUpperCase()}`,
          name: city,
          province: prov.name,
          regencyOrCity: cleanName,
          type: isCity ? 'KOTA' : 'KABUPATEN',
          costIndexVsJakarta: prov.defaultCostIndexVsJakarta,
          provincesOrCities: [cleanName.toLowerCase(), prov.name.toLowerCase()],
        });
      }
    }
  }

  public getAllProvinces(): ProvinceDetail[] {
    return INDONESIA_38_PROVINCES;
  }

  public getAllRegions(): RegionMaster[] {
    return Array.from(this.regionMasters.values());
  }

  public getRegionById(id: string): RegionMaster | undefined {
    return this.regionMasters.get(id);
  }

  public findRegion(query: { province?: string; city?: string; regency?: string }): {
    matchedRegion: RegionMaster;
    matchType: 'EXACT_CITY' | 'PROVINCE' | 'NATIONAL';
    fallbackOccurred: boolean;
  } {
    const defaultRegion: RegionMaster = {
      id: 'REG-ID-JK',
      code: 'ID-JK',
      name: 'DKI Jakarta (Acuan Nasional)',
      province: 'DKI Jakarta',
      regencyOrCity: 'Jakarta',
      type: 'PROVINSI',
      costIndexVsJakarta: 1.00,
      provincesOrCities: ['jakarta', 'jabodetabek'],
    };

    const targetCity = (query.city || query.regency || '').toLowerCase().trim();
    const targetProv = (query.province || '').toLowerCase().trim();

    // 1. Search exact city/regency match
    if (targetCity) {
      for (const reg of this.regionMasters.values()) {
        if (reg.regencyOrCity.toLowerCase() === targetCity || reg.name.toLowerCase().includes(targetCity)) {
          return {
            matchedRegion: reg,
            matchType: 'EXACT_CITY',
            fallbackOccurred: false,
          };
        }
      }
    }

    // 2. Search province match
    if (targetProv) {
      for (const reg of this.regionMasters.values()) {
        if (reg.type === 'PROVINSI' && reg.province.toLowerCase().includes(targetProv)) {
          return {
            matchedRegion: reg,
            matchType: 'PROVINCE',
            fallbackOccurred: Boolean(targetCity),
          };
        }
      }
    }

    // 3. Fallback to DKI Jakarta / National reference
    return {
      matchedRegion: defaultRegion,
      matchType: 'NATIONAL',
      fallbackOccurred: true,
    };
  }
}

export const nationalRegionService = NationalRegionService.getInstance();
export const NATIONAL_REGIONS = nationalRegionService.getAllRegions();

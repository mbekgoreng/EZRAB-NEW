/**
 * indonesiaRegions — basis data wilayah Indonesia untuk EZRAB.
 *
 * Data: 38 provinsi dan 514 kabupaten/kota (416 kabupaten + 98 kota),
 * nama resmi mengikuti daftar Kemendagri (pasca pemekaran Papua 2022).
 * Nama kabupaten ditulis TANPA awalan "Kabupaten"; kota dibedakan lewat
 * penanda `type: 'kota'`.
 *
 * Resolusi harga (resolveRegionIndex):
 * - Indeks harga EZRAB bersifat LEVEL PROVINSI (REGIONAL_PRICE_INDICES di
 *   parametricVolumeEngine) — BUKAN harga HSPK per kabupaten/kota.
 *   Kabupaten/kota mewarisi indeks provinsinya.
 * - Angka indeks TIDAK dibuat di sini: selalu diambil dari
 *   REGIONAL_PRICE_INDICES yang sudah ada. Provinsi yang belum punya
 *   entri di sana (saat ini: Aceh) jatuh ke indeks dasar engine (1,00 =
 *   DKI Jakarta) dan DITANDAI `isFallback: true` — pemanggil wajib
 *   menampilkan penanda itu secara jujur, bukan menyembunyikannya.
 */

import { REGIONAL_PRICE_INDICES } from '../engine/parametricVolumeEngine/parametricVolumeEngine';

export type RegencyType = 'kabupaten' | 'kota';

export interface Regency {
  name: string;
  type: RegencyType;
}

export interface Province {
  name: string;
  regencies: Regency[];
}

interface RawProvince {
  name: string;
  kabupaten: string[];
  kota: string[];
}

const RAW_PROVINCES: RawProvince[] = [
  {
    name: 'Aceh',
    kabupaten: ['Aceh Barat', 'Aceh Barat Daya', 'Aceh Besar', 'Aceh Jaya', 'Aceh Selatan', 'Aceh Singkil', 'Aceh Tamiang', 'Aceh Tengah', 'Aceh Tenggara', 'Aceh Timur', 'Aceh Utara', 'Bener Meriah', 'Bireuen', 'Gayo Lues', 'Nagan Raya', 'Pidie', 'Pidie Jaya', 'Simeulue'],
    kota: ['Banda Aceh', 'Langsa', 'Lhokseumawe', 'Sabang', 'Subulussalam'],
  },
  {
    name: 'Sumatera Utara',
    kabupaten: ['Asahan', 'Batu Bara', 'Dairi', 'Deli Serdang', 'Humbang Hasundutan', 'Karo', 'Labuhanbatu', 'Labuhanbatu Selatan', 'Labuhanbatu Utara', 'Langkat', 'Mandailing Natal', 'Nias', 'Nias Barat', 'Nias Selatan', 'Nias Utara', 'Padang Lawas', 'Padang Lawas Utara', 'Pakpak Bharat', 'Samosir', 'Serdang Bedagai', 'Simalungun', 'Tapanuli Selatan', 'Tapanuli Tengah', 'Tapanuli Utara', 'Toba'],
    kota: ['Binjai', 'Gunungsitoli', 'Medan', 'Padang Sidempuan', 'Pematangsiantar', 'Sibolga', 'Tanjungbalai', 'Tebing Tinggi'],
  },
  {
    name: 'Sumatera Barat',
    kabupaten: ['Agam', 'Dharmasraya', 'Kepulauan Mentawai', 'Lima Puluh Kota', 'Padang Pariaman', 'Pasaman', 'Pasaman Barat', 'Pesisir Selatan', 'Sijunjung', 'Solok', 'Solok Selatan', 'Tanah Datar'],
    kota: ['Bukittinggi', 'Padang', 'Padang Panjang', 'Pariaman', 'Payakumbuh', 'Sawahlunto', 'Solok'],
  },
  {
    name: 'Riau',
    kabupaten: ['Bengkalis', 'Indragiri Hilir', 'Indragiri Hulu', 'Kampar', 'Kepulauan Meranti', 'Kuantan Singingi', 'Pelalawan', 'Rokan Hilir', 'Rokan Hulu', 'Siak'],
    kota: ['Dumai', 'Pekanbaru'],
  },
  {
    name: 'Kepulauan Riau',
    kabupaten: ['Bintan', 'Karimun', 'Kepulauan Anambas', 'Lingga', 'Natuna'],
    kota: ['Batam', 'Tanjungpinang'],
  },
  {
    name: 'Jambi',
    kabupaten: ['Batanghari', 'Bungo', 'Kerinci', 'Merangin', 'Muaro Jambi', 'Sarolangun', 'Tanjung Jabung Barat', 'Tanjung Jabung Timur', 'Tebo'],
    kota: ['Jambi', 'Sungai Penuh'],
  },
  {
    name: 'Sumatera Selatan',
    kabupaten: ['Banyuasin', 'Empat Lawang', 'Lahat', 'Muara Enim', 'Musi Banyuasin', 'Musi Rawas', 'Musi Rawas Utara', 'Ogan Ilir', 'Ogan Komering Ilir', 'Ogan Komering Ulu', 'Ogan Komering Ulu Selatan', 'Ogan Komering Ulu Timur', 'Penukal Abab Lematang Ilir'],
    kota: ['Lubuklinggau', 'Pagar Alam', 'Palembang', 'Prabumulih'],
  },
  {
    name: 'Kepulauan Bangka Belitung',
    kabupaten: ['Bangka', 'Bangka Barat', 'Bangka Selatan', 'Bangka Tengah', 'Belitung', 'Belitung Timur'],
    kota: ['Pangkalpinang'],
  },
  {
    name: 'Bengkulu',
    kabupaten: ['Bengkulu Selatan', 'Bengkulu Tengah', 'Bengkulu Utara', 'Kaur', 'Kepahiang', 'Lebong', 'Mukomuko', 'Rejang Lebong', 'Seluma'],
    kota: ['Bengkulu'],
  },
  {
    name: 'Lampung',
    kabupaten: ['Lampung Barat', 'Lampung Selatan', 'Lampung Tengah', 'Lampung Timur', 'Lampung Utara', 'Mesuji', 'Pesawaran', 'Pesisir Barat', 'Pringsewu', 'Tanggamus', 'Tulang Bawang', 'Tulang Bawang Barat', 'Way Kanan'],
    kota: ['Bandar Lampung', 'Metro'],
  },
  {
    name: 'DKI Jakarta',
    kabupaten: ['Kepulauan Seribu'],
    kota: ['Jakarta Barat', 'Jakarta Pusat', 'Jakarta Selatan', 'Jakarta Timur', 'Jakarta Utara'],
  },
  {
    name: 'Jawa Barat',
    kabupaten: ['Bandung', 'Bandung Barat', 'Bekasi', 'Bogor', 'Ciamis', 'Cianjur', 'Cirebon', 'Garut', 'Indramayu', 'Karawang', 'Kuningan', 'Majalengka', 'Pangandaran', 'Purwakarta', 'Subang', 'Sukabumi', 'Sumedang', 'Tasikmalaya'],
    kota: ['Bandung', 'Banjar', 'Bekasi', 'Bogor', 'Cimahi', 'Cirebon', 'Depok', 'Sukabumi', 'Tasikmalaya'],
  },
  {
    name: 'Banten',
    kabupaten: ['Lebak', 'Pandeglang', 'Serang', 'Tangerang'],
    kota: ['Cilegon', 'Serang', 'Tangerang', 'Tangerang Selatan'],
  },
  {
    name: 'Jawa Tengah',
    kabupaten: ['Banjarnegara', 'Banyumas', 'Batang', 'Blora', 'Boyolali', 'Brebes', 'Cilacap', 'Demak', 'Grobogan', 'Jepara', 'Karanganyar', 'Kebumen', 'Kendal', 'Klaten', 'Kudus', 'Magelang', 'Pati', 'Pekalongan', 'Pemalang', 'Purbalingga', 'Purworejo', 'Rembang', 'Semarang', 'Sragen', 'Sukoharjo', 'Tegal', 'Temanggung', 'Wonogiri', 'Wonosobo'],
    kota: ['Magelang', 'Pekalongan', 'Salatiga', 'Semarang', 'Surakarta', 'Tegal'],
  },
  {
    name: 'Daerah Istimewa Yogyakarta',
    kabupaten: ['Bantul', 'Gunungkidul', 'Kulon Progo', 'Sleman'],
    kota: ['Yogyakarta'],
  },
  {
    name: 'Jawa Timur',
    kabupaten: ['Bangkalan', 'Banyuwangi', 'Blitar', 'Bojonegoro', 'Bondowoso', 'Gresik', 'Jember', 'Jombang', 'Kediri', 'Lamongan', 'Lumajang', 'Madiun', 'Magetan', 'Malang', 'Mojokerto', 'Nganjuk', 'Ngawi', 'Pacitan', 'Pamekasan', 'Pasuruan', 'Ponorogo', 'Probolinggo', 'Sampang', 'Sidoarjo', 'Situbondo', 'Sumenep', 'Trenggalek', 'Tuban', 'Tulungagung'],
    kota: ['Batu', 'Blitar', 'Kediri', 'Madiun', 'Malang', 'Mojokerto', 'Pasuruan', 'Probolinggo', 'Surabaya'],
  },
  {
    name: 'Bali',
    kabupaten: ['Badung', 'Bangli', 'Buleleng', 'Gianyar', 'Jembrana', 'Karangasem', 'Klungkung', 'Tabanan'],
    kota: ['Denpasar'],
  },
  {
    name: 'Nusa Tenggara Barat',
    kabupaten: ['Bima', 'Dompu', 'Lombok Barat', 'Lombok Tengah', 'Lombok Timur', 'Lombok Utara', 'Sumbawa', 'Sumbawa Barat'],
    kota: ['Bima', 'Mataram'],
  },
  {
    name: 'Nusa Tenggara Timur',
    kabupaten: ['Alor', 'Belu', 'Ende', 'Flores Timur', 'Kupang', 'Lembata', 'Malaka', 'Manggarai', 'Manggarai Barat', 'Manggarai Timur', 'Nagekeo', 'Ngada', 'Rote Ndao', 'Sabu Raijua', 'Sikka', 'Sumba Barat', 'Sumba Barat Daya', 'Sumba Tengah', 'Sumba Timur', 'Timor Tengah Selatan', 'Timor Tengah Utara'],
    kota: ['Kupang'],
  },
  {
    name: 'Kalimantan Barat',
    kabupaten: ['Bengkayang', 'Kapuas Hulu', 'Kayong Utara', 'Ketapang', 'Kubu Raya', 'Landak', 'Melawi', 'Mempawah', 'Sambas', 'Sanggau', 'Sekadau', 'Sintang'],
    kota: ['Pontianak', 'Singkawang'],
  },
  {
    name: 'Kalimantan Tengah',
    kabupaten: ['Barito Selatan', 'Barito Timur', 'Barito Utara', 'Gunung Mas', 'Kapuas', 'Katingan', 'Kotawaringin Barat', 'Kotawaringin Timur', 'Lamandau', 'Murung Raya', 'Pulang Pisau', 'Seruyan', 'Sukamara'],
    kota: ['Palangka Raya'],
  },
  {
    name: 'Kalimantan Selatan',
    kabupaten: ['Balangan', 'Banjar', 'Barito Kuala', 'Hulu Sungai Selatan', 'Hulu Sungai Tengah', 'Hulu Sungai Utara', 'Kotabaru', 'Tabalong', 'Tanah Bumbu', 'Tanah Laut', 'Tapin'],
    kota: ['Banjarbaru', 'Banjarmasin'],
  },
  {
    name: 'Kalimantan Timur',
    kabupaten: ['Berau', 'Kutai Barat', 'Kutai Kartanegara', 'Kutai Timur', 'Mahakam Ulu', 'Paser', 'Penajam Paser Utara'],
    kota: ['Balikpapan', 'Bontang', 'Samarinda'],
  },
  {
    name: 'Kalimantan Utara',
    kabupaten: ['Bulungan', 'Malinau', 'Nunukan', 'Tana Tidung'],
    kota: ['Tarakan'],
  },
  {
    name: 'Sulawesi Utara',
    kabupaten: ['Bolaang Mongondow', 'Bolaang Mongondow Selatan', 'Bolaang Mongondow Timur', 'Bolaang Mongondow Utara', 'Kepulauan Sangihe', 'Kepulauan Siau Tagulandang Biaro', 'Kepulauan Talaud', 'Minahasa', 'Minahasa Selatan', 'Minahasa Tenggara', 'Minahasa Utara'],
    kota: ['Bitung', 'Kotamobagu', 'Manado', 'Tomohon'],
  },
  {
    name: 'Sulawesi Tengah',
    kabupaten: ['Banggai', 'Banggai Kepulauan', 'Banggai Laut', 'Buol', 'Donggala', 'Morowali', 'Morowali Utara', 'Parigi Moutong', 'Poso', 'Sigi', 'Tojo Una-Una', 'Tolitoli'],
    kota: ['Palu'],
  },
  {
    name: 'Sulawesi Selatan',
    kabupaten: ['Bantaeng', 'Barru', 'Bone', 'Bulukumba', 'Enrekang', 'Gowa', 'Jeneponto', 'Kepulauan Selayar', 'Luwu', 'Luwu Timur', 'Luwu Utara', 'Maros', 'Pangkajene dan Kepulauan', 'Pinrang', 'Sidenreng Rappang', 'Sinjai', 'Soppeng', 'Takalar', 'Tana Toraja', 'Toraja Utara', 'Wajo'],
    kota: ['Makassar', 'Palopo', 'Parepare'],
  },
  {
    name: 'Sulawesi Tenggara',
    kabupaten: ['Bombana', 'Buton', 'Buton Selatan', 'Buton Tengah', 'Buton Utara', 'Kolaka', 'Kolaka Timur', 'Kolaka Utara', 'Konawe', 'Konawe Kepulauan', 'Konawe Selatan', 'Konawe Utara', 'Muna', 'Muna Barat', 'Wakatobi'],
    kota: ['Baubau', 'Kendari'],
  },
  {
    name: 'Gorontalo',
    kabupaten: ['Boalemo', 'Bone Bolango', 'Gorontalo', 'Gorontalo Utara', 'Pohuwato'],
    kota: ['Gorontalo'],
  },
  {
    name: 'Sulawesi Barat',
    kabupaten: ['Majene', 'Mamasa', 'Mamuju', 'Mamuju Tengah', 'Pasangkayu', 'Polewali Mandar'],
    kota: [],
  },
  {
    name: 'Maluku',
    kabupaten: ['Buru', 'Buru Selatan', 'Kepulauan Aru', 'Kepulauan Tanimbar', 'Maluku Barat Daya', 'Maluku Tengah', 'Maluku Tenggara', 'Seram Bagian Barat', 'Seram Bagian Timur'],
    kota: ['Ambon', 'Tual'],
  },
  {
    name: 'Maluku Utara',
    kabupaten: ['Halmahera Barat', 'Halmahera Selatan', 'Halmahera Tengah', 'Halmahera Timur', 'Halmahera Utara', 'Kepulauan Sula', 'Pulau Morotai', 'Pulau Taliabu'],
    kota: ['Ternate', 'Tidore Kepulauan'],
  },
  {
    name: 'Papua',
    kabupaten: ['Biak Numfor', 'Jayapura', 'Keerom', 'Kepulauan Yapen', 'Mamberamo Raya', 'Sarmi', 'Supiori', 'Waropen'],
    kota: ['Jayapura'],
  },
  {
    name: 'Papua Barat',
    kabupaten: ['Fakfak', 'Kaimana', 'Manokwari', 'Manokwari Selatan', 'Pegunungan Arfak', 'Teluk Bintuni', 'Teluk Wondama'],
    kota: [],
  },
  {
    name: 'Papua Barat Daya',
    kabupaten: ['Maybrat', 'Raja Ampat', 'Sorong', 'Sorong Selatan', 'Tambrauw'],
    kota: ['Sorong'],
  },
  {
    name: 'Papua Tengah',
    kabupaten: ['Deiyai', 'Dogiyai', 'Intan Jaya', 'Mimika', 'Nabire', 'Paniai', 'Puncak', 'Puncak Jaya'],
    kota: [],
  },
  {
    name: 'Papua Pegunungan',
    kabupaten: ['Jayawijaya', 'Lanny Jaya', 'Mamberamo Tengah', 'Nduga', 'Pegunungan Bintang', 'Tolikara', 'Yahukimo', 'Yalimo'],
    kota: [],
  },
  {
    name: 'Papua Selatan',
    kabupaten: ['Asmat', 'Boven Digoel', 'Mappi', 'Merauke'],
    kota: [],
  },
];

export const INDONESIA_PROVINCES: Province[] = RAW_PROVINCES.map((p) => ({
  name: p.name,
  regencies: [
    ...p.kabupaten.map((name): Regency => ({ name, type: 'kabupaten' })),
    ...p.kota.map((name): Regency => ({ name, type: 'kota' })),
  ],
}));

/* ------------------------------------------------------------------ */
/* Helper pencarian                                                    */
/* ------------------------------------------------------------------ */

/** Normalisasi nama wilayah: huruf kecil, tanpa awalan administratif. */
export function normalizeRegionName(raw: string): string {
  return (raw || '')
    .toLowerCase()
    .replace(/[.,]/g, ' ')
    .replace(/^\s*(kabupaten|kab|kota)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Daftar nama 38 provinsi (urutan barat → timur). */
export function listProvinces(): string[] {
  return INDONESIA_PROVINCES.map((p) => p.name);
}

/** Provinsi berdasarkan nama (tak peka huruf besar/kecil). */
export function findProvinceByName(name: string): Province | null {
  const q = normalizeRegionName(name);
  return INDONESIA_PROVINCES.find((p) => normalizeRegionName(p.name) === q) ?? null;
}

/** Daftar kabupaten/kota dalam satu provinsi (nama provinsi tak peka huruf). */
export function listRegencies(provinceName: string): Regency[] {
  return findProvinceByName(provinceName)?.regencies ?? [];
}

export interface RegencyMatch {
  province: string;
  regency: Regency;
}

/**
 * Cari kabupaten/kota dari teks bebas. Cocok persis (setelah normalisasi,
 * termasuk membuang awalan "Kab."/"Kabupaten"/"Kota") diutamakan; bila
 * tidak ada, jatuh ke kecocokan "mengandung". Mengembalikan SEMUA hasil —
 * mis. "bogor" → Kabupaten Bogor + Kota Bogor (keduanya Jawa Barat).
 */
export function findRegency(query: string): RegencyMatch[] {
  const q = normalizeRegionName(query);
  if (!q) return [];
  const exact: RegencyMatch[] = [];
  const partial: RegencyMatch[] = [];
  for (const p of INDONESIA_PROVINCES) {
    for (const r of p.regencies) {
      const rn = normalizeRegionName(r.name);
      if (rn === q) exact.push({ province: p.name, regency: r });
      else if (rn.includes(q) || q.includes(rn)) partial.push({ province: p.name, regency: r });
    }
  }
  return exact.length > 0 ? exact : partial;
}

/**
 * Format lokasi gabungan yang dipakai di seluruh EZRAB (ringkasan
 * kebutuhan, draft sesi, prompt): "Kabupaten X, Provinsi Y" untuk
 * kabupaten dan "Kota X, Provinsi Y" untuk kota. `regency` dapat berupa
 * objek Regency atau nama (tipe dicari dari data provinsi; bila tak
 * ditemukan, nama dipakai apa adanya tanpa awalan).
 */
export function formatLocation(provinceName: string, regency?: Regency | string | null): string {
  const province = findProvinceByName(provinceName)?.name ?? provinceName;
  if (!regency) return `Provinsi ${province}`;
  let reg: Regency | null = null;
  if (typeof regency === 'string') {
    const q = normalizeRegionName(regency);
    reg = listRegencies(province).find((r) => normalizeRegionName(r.name) === q) ?? null;
    if (!reg) return `${regency}, Provinsi ${province}`;
  } else {
    reg = regency;
  }
  const prefix = reg.type === 'kota' ? 'Kota' : 'Kabupaten';
  return `${prefix} ${reg.name}, Provinsi ${province}`;
}

/**
 * Tebak provinsi dari teks lokasi bebas (mis. location dari chat/proyek:
 * "Bogor", "Kabupaten Bogor, Provinsi Jawa Barat", "Bandung",
 * "BSD City, Tangerang Selatan"). Urutan: nama provinsi yang muncul di
 * teks → nama kabupaten/kota yang muncul di teks (nama terpanjang dulu
 * agar "Tangerang Selatan" tidak tertelan "Tangerang"). Null bila tidak
 * ada yang cocok — pemanggil memutuskan fallback-nya sendiri.
 */
export function resolveProvinceFromLocation(location: string | null | undefined): string | null {
  if (!location) return null;
  const text = ` ${location.toLowerCase().replace(/\s+/g, ' ')} `;
  for (const p of INDONESIA_PROVINCES) {
    if (text.includes(` ${p.name.toLowerCase()} `) || text.includes(` ${p.name.toLowerCase()},`)) {
      return p.name;
    }
  }
  const all: RegencyMatch[] = [];
  for (const p of INDONESIA_PROVINCES) {
    for (const r of p.regencies) all.push({ province: p.name, regency: r });
  }
  all.sort((a, b) => b.regency.name.length - a.regency.name.length);
  for (const m of all) {
    if (text.includes(` ${m.regency.name.toLowerCase()} `) || text.includes(` ${m.regency.name.toLowerCase()},`)) {
      return m.province;
    }
  }
  // Teks yang PERSIS nama wilayah (kasus umum location 1–2 kata dari chat).
  const exact = findRegency(location);
  return exact.length > 0 ? exact[0].province : null;
}

/**
 * Urungkan formatLocation: "Kabupaten X, Provinsi Y" / "Kota X, Provinsi Y"
 * → { province, regency } terverifikasi terhadap data. Null bila format
 * tidak cocok (lokasi teks bebas lama) — pemanggil dapat jatuh ke
 * resolveProvinceFromLocation untuk menebak provinsinya saja.
 */
export function parseFormattedLocation(
  location: string,
): { province: string; regency: Regency } | null {
  const m = (location || '').trim().match(/^(kabupaten|kota)\s+(.+?),\s*provinsi\s+(.+)$/i);
  if (!m) return null;
  const prov = findProvinceByName(m[3].trim());
  if (!prov) return null;
  const type: RegencyType = m[1].toLowerCase() === 'kota' ? 'kota' : 'kabupaten';
  const q = normalizeRegionName(m[2]);
  const reg = prov.regencies.find((r) => r.type === type && normalizeRegionName(r.name) === q);
  return reg ? { province: prov.name, regency: reg } : null;
}

/* ------------------------------------------------------------------ */
/* Resolusi indeks harga regional (level provinsi)                     */
/* ------------------------------------------------------------------ */

/**
 * Nama resmi provinsi → kunci REGIONAL_PRICE_INDICES bila berbeda.
 * (Hanya pemetaan nama — TIDAK ada angka baru di sini.)
 */
const PROVINCE_TO_ENGINE_KEY: Record<string, string> = {
  'Kepulauan Bangka Belitung': 'Bangka Belitung',
  'Daerah Istimewa Yogyakarta': 'DI Yogyakarta',
};

/** Kunci & nilai indeks dasar engine (dipakai engine untuk region tak dikenal: pengali 1,0). */
export const ENGINE_DEFAULT_REGION = 'DKI Jakarta';

export interface RegionIndexResolution {
  /** Nama provinsi resmi (input yang ternormalisasi). */
  province: string;
  /** Kunci yang aman diteruskan ke parametricVolumeEngine.calculate. */
  region: string;
  /** Pengali harga dari REGIONAL_PRICE_INDICES (atau indeks dasar bila fallback). */
  index: number;
  /** true bila provinsi belum punya indeks khusus → memakai indeks dasar. */
  isFallback: boolean;
}

/**
 * Resolusi indeks harga untuk satu provinsi. Kabupaten/kota mewarisi
 * indeks provinsinya (panggil fungsi ini dengan nama provinsi hasil
 * findRegency/resolveProvinceFromLocation).
 */
export function resolveRegionIndex(provinceName: string): RegionIndexResolution {
  const province = findProvinceByName(provinceName)?.name ?? (provinceName || '').trim();
  const key = PROVINCE_TO_ENGINE_KEY[province] ?? province;
  const index = REGIONAL_PRICE_INDICES[key];
  if (typeof index === 'number') {
    return { province, region: key, index, isFallback: false };
  }
  return {
    province,
    region: ENGINE_DEFAULT_REGION,
    index: REGIONAL_PRICE_INDICES[ENGINE_DEFAULT_REGION] ?? 1.0,
    isFallback: true,
  };
}

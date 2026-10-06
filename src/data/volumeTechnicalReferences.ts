export interface TechnicalReferenceImage {
  id: string;
  title: string;
  subtitle?: string;
  src: string;
  isPrimary?: boolean;
  width?: number;
  height?: number;
  description?: string;
  standard?: string;
}

export interface WorkTechnicalReference {
  workId: string;
  workName: string;
  category: string;
  standard?: string;
  description?: string;
  images: TechnicalReferenceImage[];
}

const BASE_PATH = '/assets/volume-calculation/references';

export const VOLUME_TECHNICAL_REFERENCES: Record<string, WorkTechnicalReference> = {
  BOWPLANK: {
    workId: 'BOWPLANK',
    workName: 'Bowplank (Pengukuran & Pemasangan)',
    category: 'Pekerjaan Persiapan',
    standard: 'AHSP S.E. BINA KONSTRUKSI NO. 30 TAHUN 2025',
    description: 'Pemasangan papan duga dan patok kayu acuan sumbu as bangunan dan elevasi nol lantai.',
    images: [
      {
        id: 'bowplank-main',
        title: 'Detail Bowplank',
        subtitle: 'Pengukuran & Pemasangan Papan Duga',
        src: `${BASE_PATH}/blowplank.jpg`,
        isPrimary: true,
        width: 1672,
        height: 941,
        standard: 'SNI 2835:2008',
        description: 'Detail teknis patok kayu, papan duga, dan jarak bebas plank terhadap garis galian tanah pondasi.',
      },
    ],
  },
  PONDASI: {
    workId: 'PONDASI',
    workName: 'Pondasi Batu Kali & Aanstampen',
    category: 'Pekerjaan Pondasi',
    standard: 'AHSP S.E. BINA KONSTRUKSI NO. 30 TAHUN 2025',
    description: 'Detail potongan melintang pondasi batu kali trapesium, aanstampen batu kosong, dan urugan pasir bawah pondasi.',
    images: [
      {
        id: 'pondasi-main',
        title: 'Detail Pondasi Batu Kali',
        subtitle: 'Potongan Melintang & Aanstampen',
        src: `${BASE_PATH}/pondasi.jpg`,
        isPrimary: true,
        width: 1672,
        height: 941,
        standard: 'SNI 2836:2008',
        description: 'Detail penampang lebar atas (a), lebar bawah (b), tinggi pondasi (h), dan lapisan batu kosong.',
      },
    ],
  },
  FOOT_PLATE: {
    workId: 'FOOT_PLATE',
    workName: 'Foot Plate (Pondasi Tapak)',
    category: 'Pekerjaan Pondasi',
    standard: 'AHSP S.E. BINA KONSTRUKSI NO. 30 TAHUN 2025',
    description: 'Detail penulangan dan geometri pondasi tapak beton bertulang setempat.',
    images: [
      {
        id: 'footplate-main',
        title: 'Detail Foot Plate (Pondasi Tapak)',
        subtitle: 'Penulangan & Geometri Beton Bertulang',
        src: `${BASE_PATH}/footplate.jpg`,
        isPrimary: true,
        width: 1672,
        height: 941,
        standard: 'SNI 6880:2016',
        description: 'Detail dimensi pelat tapak panjang (P), lebar (L), tebal pelat (t), dan penulangan anyaman.',
      },
    ],
  },
  SLOOF: {
    workId: 'SLOOF',
    workName: 'Sloof Beton Bertulang',
    category: 'Pekerjaan Struktur',
    standard: 'AHSP S.E. BINA KONSTRUKSI NO. 30 TAHUN 2025',
    description: 'Balok pengikat sloof di atas pondasi batu kali untuk meratakan beban dinding.',
    images: [
      {
        id: 'sloof-main',
        title: 'Detail Penampang Sloof',
        subtitle: 'Dimensi Penampang, Sengkang & Tulangan Utama',
        src: `${BASE_PATH}/sloof.jpg`,
        isPrimary: true,
        width: 1672,
        height: 941,
        standard: 'SNI 2847:2019',
        description: 'Detail dimensi lebar balok (b), tinggi balok (h), diameter tulangan longitudinal, dan jarak sengkang begel.',
      },
    ],
  },
  KOLOM: {
    workId: 'KOLOM',
    workName: 'Kolom Beton Bertulang',
    category: 'Pekerjaan Struktur',
    standard: 'AHSP S.E. BINA KONSTRUKSI NO. 30 TAHUN 2025',
    description: 'Kolom praktis / kolom struktur utama penopang beban vertikal lantai dan atap.',
    images: [
      {
        id: 'kolom-main',
        title: 'Detail Kolom Beton Bertulang',
        subtitle: 'Dimensi Kolom, Tulangan Utama & Begel',
        src: `${BASE_PATH}/kolom.jpg`,
        isPrimary: true,
        width: 1672,
        height: 941,
        standard: 'SNI 2847:2019',
        description: 'Detail dimensi penampang kolom (b x h), tinggi kolom, serta spasi sengkang di daerah tumpuan dan lapangan.',
      },
    ],
  },
  BALOK: {
    workId: 'BALOK',
    workName: 'Balok Beton Bertulang',
    category: 'Pekerjaan Struktur',
    standard: 'AHSP S.E. BINA KONSTRUKSI NO. 30 TAHUN 2025',
    description: 'Balok lintel / ring balk penahan beban dinding dan rangka atap.',
    images: [
      {
        id: 'balok-main',
        title: 'Detail Balok Beton Bertulang',
        subtitle: 'Dimensi Bentang & Penulangan Balok',
        src: `${BASE_PATH}/BALOK.jpg`,
        isPrimary: true,
        width: 1672,
        height: 941,
        standard: 'SNI 2847:2019',
        description: 'Detail penampang balok beton, selimut beton, dan konfigurasi tulangan tarik/tekan.',
      },
    ],
  },
  BAJA_WF: {
    workId: 'BAJA_WF',
    workName: 'Pekerjaan Struktur Baja Profil WF (Wide Flange)',
    category: 'Pekerjaan Struktur',
    standard: 'SNI 07-7178-2006 / SNI 1729:2020 / AWS D1.1',
    description: 'Detail profil baja canai panas I-Beam / H-Beam Wide Flange (WF), sambungan pelat buhul, dan baut mutu tinggi.',
    images: [
      {
        id: 'baja-wf-main',
        title: 'Detail Penampang Profil Baja WF',
        subtitle: 'Dimensi h, bf, tw, tf & Tabel Standar SNI 07-7178',
        src: `${BASE_PATH}/BALOK.jpg`,
        isPrimary: true,
        width: 1672,
        height: 941,
        standard: 'SNI 07-7178-2006',
        description: 'Detail geometri profil baja struktural I/H Wide Flange: tinggi (h), lebar sayap (bf), tebal badan (tw), dan tebal sayap (tf).',
      },
    ],
  },
  BATA_RINGAN: {
    workId: 'BATA_RINGAN',
    workName: 'Bata Ringan (Hebel)',
    category: 'Pekerjaan Dinding',
    standard: 'AHSP S.E. BINA KONSTRUKSI NO. 30 TAHUN 2025',
    description: 'Pasangan dinding bata ringan AAC tebal 7.5 cm atau 10 cm dengan semen instan (thin bed mortar).',
    images: [
      {
        id: 'hebel-main',
        title: 'Detail Pasangan Bata Ringan (Hebel)',
        subtitle: 'Geometri Dinding & Pola Pemasangan AAC',
        src: `${BASE_PATH}/BATA RINGAN.JPG`,
        isPrimary: true,
        width: 1672,
        height: 941,
        standard: 'SNI 8640:2018',
        description: 'Pemasangan bata ringan AAC tebal 10 cm dengan perekat thin-bed mortar spesi tipis 3 mm.',
      },
      {
        id: 'dinding-alt',
        title: 'Detail Konstruksi Dinding Lengkap',
        subtitle: 'Potongan Dinding, Balok Latei & Kolom Praktis',
        src: `${BASE_PATH}/dinding baru.jpg`,
        isPrimary: false,
        width: 1672,
        height: 941,
        standard: 'PUPR 2026',
        description: 'Potongan skematik pengikat dinding ke kolom praktis dan balok sloof/ring.',
      },
    ],
  },
  BATA_MERAH: {
    workId: 'BATA_MERAH',
    workName: 'Dinding Pasangan Bata Merah',
    category: 'Pekerjaan Dinding',
    standard: 'AHSP S.E. BINA KONSTRUKSI NO. 30 TAHUN 2025',
    description: 'Pasangan bata merah 1 bata / 1/2 bata dengan campuran spesi semen pasir 1:4 atau 1:5.',
    images: [
      {
        id: 'bata-merah-main',
        title: 'Detail Pasangan Bata Merah',
        subtitle: 'Pola Ikatan Bata 1/2 Bata & Siar Mortar',
        src: `${BASE_PATH}/BATA MERAH.JPG`,
        isPrimary: true,
        width: 1672,
        height: 941,
        standard: 'SNI 6897:2008',
        description: 'Detail ketebalan dinding bata merah, siar mortar 1.5 cm, dan angkur pengikat kolom praktis.',
      },
      {
        id: 'dinding-alt',
        title: 'Detail Konstruksi Dinding Lengkap',
        subtitle: 'Potongan Dinding & Perkuatan Praktis',
        src: `${BASE_PATH}/dinding baru.jpg`,
        isPrimary: false,
        width: 1672,
        height: 941,
        standard: 'PUPR 2026',
      },
    ],
  },
  BATAKO: {
    workId: 'BATAKO',
    workName: 'Dinding Pasangan Batako',
    category: 'Pekerjaan Dinding',
    standard: 'AHSP S.E. BINA KONSTRUKSI NO. 30 TAHUN 2025',
    description: 'Pasangan dinding batako cetak semen PC dengan spesi 1:4.',
    images: [
      {
        id: 'batako-main',
        title: 'Detail Pasangan Batako',
        subtitle: 'Pola Pasangan Batako Berlubang / Padat',
        src: `${BASE_PATH}/BATAKO.jpg`,
        isPrimary: true,
        width: 1672,
        height: 941,
        standard: 'SNI 03-0349-1989',
        description: 'Detail ukuran batako dan pola perletakan siar pengisi mortar adukan semen pasir.',
      },
      {
        id: 'dinding-alt',
        title: 'Detail Konstruksi Dinding Lengkap',
        subtitle: 'Potongan Dinding & Kolom Pengaku',
        src: `${BASE_PATH}/dinding baru.jpg`,
        isPrimary: false,
        width: 1672,
        height: 941,
        standard: 'PUPR 2026',
      },
    ],
  },
  PINTU_JENDELA: {
    workId: 'PINTU_JENDELA',
    workName: 'Pintu & Jendela',
    category: 'Pekerjaan Arsitektur',
    standard: 'AHSP S.E. BINA KONSTRUKSI NO. 30 TAHUN 2025',
    description: 'Pemasangan kusen aluminium / kayu dan daun pintu/jendela lengkap dengan engsel dan kunci.',
    images: [
      {
        id: 'kusen-main',
        title: 'Detail Kusen Pintu & Jendela',
        subtitle: 'Dimensi Bukaan, Kusen & Daun Pintu/Jendela',
        src: `${BASE_PATH}/kusen pintu jendela.jpg`,
        isPrimary: true,
        width: 1672,
        height: 941,
        standard: 'SNI 03-0675-1989',
        description: 'Detail lebar bukaan kotor (W), tinggi (H), profil kusen, serta engsel dan aksesoris kunci.',
      },
    ],
  },
  ATAP_BAJA_RINGAN: {
    workId: 'ATAP_BAJA_RINGAN',
    workName: 'Rangka Atap Baja Ringan',
    category: 'Pekerjaan Atap',
    standard: 'AHSP S.E. BINA KONSTRUKSI NO. 30 TAHUN 2025',
    description: 'Struktur kuda-kuda baja ringan truss canal C-75 dan reng baja ringan untuk genteng atau seng.',
    images: [
      {
        id: 'atap-main',
        title: 'Detail Rangka Atap Baja Ringan',
        subtitle: 'Geometri Kuda-kuda Pelana & Reng',
        src: `${BASE_PATH}/atap pelana baja ringan.jpg`,
        isPrimary: true,
        width: 1672,
        height: 941,
        standard: 'SNI 7971:2013',
        description: 'Detail sudut kemiringan atap (α), panjang jurai, bentang kuda-kuda, dan jarak tumpuan overstek.',
      },
    ],
  },
  PLESTERAN_ACIAN: {
    workId: 'PLESTERAN_ACIAN',
    workName: 'Plesteran & Acian',
    category: 'Pekerjaan Arsitektur',
    standard: 'AHSP S.E. BINA KONSTRUKSI NO. 30 TAHUN 2025',
    description: 'Pekerjaan plesteran dinding 1:4 tebal 15 mm dan acian semen halus tebal 2-3 mm 2 sisi.',
    images: [
      {
        id: 'plester-main',
        title: 'Detail Plesteran & Acian',
        subtitle: 'Lapisan Plesteran Dinding & Finishing Acian',
        src: `${BASE_PATH}/plester dinding acian.jpg`,
        isPrimary: true,
        width: 1672,
        height: 941,
        standard: 'SNI 2837:2008',
        description: 'Detail ketebalan lapisan kamprotan, plesteran perata, dan acian siap cat.',
      },
    ],
  },
  PENUTUP_LANTAI: {
    workId: 'PENUTUP_LANTAI',
    workName: 'Penutup Lantai (Keramik/Granit)',
    category: 'Pekerjaan Arsitektur',
    standard: 'AHSP S.E. BINA KONSTRUKSI NO. 30 TAHUN 2025',
    description: 'Pemasangan penutup lantai keramik / homogenus tile granit dengan spesi perekat dan semen nat.',
    images: [
      {
        id: 'lantai-main',
        title: 'Detail Penutup Lantai',
        subtitle: 'Pola Pemasangan Keramik/Granit & Screed',
        src: `${BASE_PATH}/penutup lantai.jpg`,
        isPrimary: true,
        width: 1672,
        height: 941,
        standard: 'SNI 7395:2008',
        description: 'Detail lapisan lantai kerja pasir, rabat beton screed, mortar perekat, dan tile keramik.',
      },
    ],
  },
  PENUTUP_DINDING: {
    workId: 'PENUTUP_DINDING',
    workName: 'Penutup Dinding Keramik',
    category: 'Pekerjaan Arsitektur',
    standard: 'AHSP S.E. BINA KONSTRUKSI NO. 30 TAHUN 2025',
    description: 'Pemasangan keramik dinding area basah (kamar mandi, dapur, dsb).',
    images: [
      {
        id: 'dinding-tile-main',
        title: 'Detail Penutup Dinding Keramik',
        subtitle: 'Keramik Dinding Kamar Mandi & Dapur',
        src: `${BASE_PATH}/penutup dinding.jpg`,
        isPrimary: true,
        width: 1672,
        height: 941,
        standard: 'SNI 7395:2008',
        description: 'Detail modul pasangan keramik dinding, tinggi elevasi basah, dan grout semen warna.',
      },
    ],
  },
  PLAFON: {
    workId: 'PLAFON',
    workName: 'Plafon Gypsum & Rangka',
    category: 'Pekerjaan Arsitektur',
    standard: 'AHSP S.E. BINA KONSTRUKSI NO. 30 TAHUN 2025',
    description: 'Pemasangan rangka hollow galvanis 20x40 / 40x40 dan penutup lembaran gypsum 9 mm.',
    images: [
      {
        id: 'plafon-main',
        title: 'Detail Plafon Gypsum & Rangka Hollow',
        subtitle: 'Jarak Modul Penggantung & Lis Profil',
        src: `${BASE_PATH}/pemasangan plafond.jpg`,
        isPrimary: true,
        width: 1672,
        height: 941,
        standard: 'SNI 03-6434-2000',
        description: 'Detail jarak batang utama, batang pembagi 60x60 cm, kawat penggantung, dan penutup gypsum board.',
      },
    ],
  },
  PENGECATAN: {
    workId: 'PENGECATAN',
    workName: 'Pengecatan Dinding & Plafon',
    category: 'Pekerjaan Arsitektur',
    standard: 'AHSP S.E. BINA KONSTRUKSI NO. 30 TAHUN 2025',
    description: 'Pengecatan dinding baru interior/eksterior dan plafon dengan cat dasar dan cat penutup 2 lapis.',
    images: [
      {
        id: 'cat-main',
        title: 'Detail Pengecatan Dinding & Plafon',
        subtitle: 'Pengecatan Dinding Baru & Plasi',
        src: `${BASE_PATH}/dinding baru.jpg`,
        isPrimary: true,
        width: 1672,
        height: 941,
        standard: 'SNI 2407:2008',
        description: 'Detail luas bidang dinding yang dicat, pembersihan dasar, plamir, dan lapisan cat emulsi.',
      },
    ],
  },
  KELISTRIKAN: {
    workId: 'KELISTRIKAN',
    workName: 'Instalasi Kelistrikan & Titik Lampu',
    category: 'Pekerjaan MEP',
    standard: 'PUIL 2011 / AHSP 2025',
    description: 'Pemasangan instalasi titik lampu NYM 3x1.5 mm, stop kontak, saklar, dan panel MCB box.',
    images: [
      {
        id: 'listrik-main',
        title: 'Detail Jaringan Kelistrikan',
        subtitle: 'Diagram Titik Lampu, Stop Kontak & MCB',
        src: `${BASE_PATH}/jaringan listrik.jpg`,
        isPrimary: true,
        width: 1672,
        height: 941,
        standard: 'PUIL 2011',
        description: 'Skematik pengkabelan dalam pipa conduit PVC, percabangan t-dos, dan grounding.',
      },
    ],
  },
  AIR_BERSIH: {
    workId: 'AIR_BERSIH',
    workName: 'Instalasi Air Bersih (Plumbing)',
    category: 'Pekerjaan MEP',
    standard: 'AHSP S.E. BINA KONSTRUKSI NO. 30 TAHUN 2025',
    description: 'Pemasangan pipa PVC AW 1/2 inch dan 3/4 inch untuk distribusi air bersih.',
    images: [],
  },
  SANITAIR: {
    workId: 'SANITAIR',
    workName: 'Peralatan Sanitair',
    category: 'Pekerjaan MEP',
    standard: 'AHSP S.E. BINA KONSTRUKSI NO. 30 TAHUN 2025',
    description: 'Pemasangan kloset duduk/jongkok, wastafel, floor drain, kran air, dan jet shower.',
    images: [],
  },
};

export const getWorkTechnicalReference = (workId: string): WorkTechnicalReference | null => {
  const normalized = workId.toUpperCase();
  if (VOLUME_TECHNICAL_REFERENCES[normalized]) {
    return VOLUME_TECHNICAL_REFERENCES[normalized];
  }
  // Aliases
  if (normalized === 'INSTALASI_AIR') return VOLUME_TECHNICAL_REFERENCES['AIR_BERSIH'] || null;
  if (normalized === 'CAT' || normalized === 'CAT_DINDING') return VOLUME_TECHNICAL_REFERENCES['PENGECATAN'] || null;
  if (normalized === 'KUSEN' || normalized === 'PINTU') return VOLUME_TECHNICAL_REFERENCES['PINTU_JENDELA'] || null;
  if (normalized === 'ATAP' || normalized === 'PENUTUP_ATAP') return VOLUME_TECHNICAL_REFERENCES['ATAP_BAJA_RINGAN'] || null;
  if (normalized === 'BETON_PONDASI' || normalized === 'BEKISTING_PONDASI' || normalized === 'PEMBESIAN_PONDASI') {
    return VOLUME_TECHNICAL_REFERENCES['FOOT_PLATE'] || null;
  }
  return null;
};

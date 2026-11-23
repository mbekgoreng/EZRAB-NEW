/**
 * conceptualWbs.ts — WBS KONSEPTUAL per kategori proyek (Gelombang A,
 * Fase 6). Struktur paket pekerjaan konseptual untuk diskusi & brief:
 * membantu percakapan teknis dan kesiapan draft manual/non-AHSP.
 *
 * LABEL WAJIB: WBS ini KONSEPTUAL — bukan BOQ terverifikasi, bukan
 * AHSP, dan tidak memuat angka/volume/harga apa pun. Susunan final
 * BOQ tetap ditentukan engine katalog (universalRab) dari template
 * resmi, atau item manual berlabel jujur yang dibuat pengguna.
 *
 * KUNCI ADA DUA KELUARGA (W3/W9 G3, 2026-11-22 — perluasan 6→18 scope):
 * - 6 kunci subkategori intake warisan (`rumah`, `gudang-industri`,
 *   `kandang`, `jembatan`, `renovasi`, `kolam`) — dipakai
 *   `universalIntake`/`wbsArtifact` dengan ID subkategori; DIPERTAHANKAN
 *   apa adanya (konsumen lama tetap mendapat daftar yang sama).
 * - 18 kunci scope engine (`SCOPE_GROUPS`, universalRab) — `jembatan`
 *   + `renovasi` sudah ada sebagai kunci ganda (subkategori = scope),
 *   16 kunci scope sisanya ditambahkan di bawah. Isi tiap entri scope
 *   diturunkan dari `CONSTRUCTION_KNOWLEDGE.conceptualWbs` record yang
 *   dicantumkan di komentar entri (pengetahuan konseptual internal yang
 *   sudah ada — bukan karangan baru); tanpa angka/dimensi/grade/harga.
 */

export const CONCEPTUAL_WBS_LABEL =
  'WBS konseptual (struktur diskusi — BUKAN BOQ terverifikasi/AHSP, tanpa angka)';

const WBS: Record<string, string[]> = {
  rumah: [
    'Pekerjaan persiapan & pengukuran',
    'Pekerjaan tanah & pondasi',
    'Pekerjaan struktur (sloof, kolom, balok, pelat)',
    'Pekerjaan dinding & plesteran',
    'Pekerjaan atap',
    'Pekerjaan lantai, pintu & jendela',
    'Pekerjaan finishing & pengecatan',
    'Pekerjaan sanitair & plumbing',
    'Pekerjaan elektrikal',
    'Pekerjaan luar (pagar, carport, drainase lingkungan)',
  ],
  'gudang-industri': [
    'Pekerjaan persiapan & pematangan lahan',
    'Pekerjaan pondasi (telapak/pancang sesuai daya dukung)',
    'Struktur utama: portal frame baja WF atau rangka truss (dipilih eksplisit)',
    'Pekerjaan lantai beton & floor hardener',
    'Dinding & cladding',
    'Atap bentang lebar & talang',
    'Pintu gudang (rolling/folding) & loading area',
    'Utilitas: elektrikal, penerangan high-bay, drainase kawasan',
  ],
  kandang: [
    'Pekerjaan persiapan & pembersihan lahan kandang',
    'Pondasi kolom & sloof kandang',
    'Kolom & struktur utama (beton/kayu/baja ringan)',
    'Rangka & penutup atap kandang',
    'Lantai kandang miring ke drainase (mudah dibersihkan)',
    'Sekat kandang & pagar pembatas',
    'Saluran drainase & penampungan limbah',
    'Instalasi air minum ternak & listrik sederhana',
  ],
  jembatan: [
    'Pekerjaan persiapan & akses kerja',
    'Pondasi & abutment (kepala jembatan)',
    'Struktur bawah (pilar bila ada)',
    'Struktur atas: gelagar & pelat lantai jembatan (beton/baja/kayu — dipilih eksplisit)',
    'Oprit & jalan pendekat',
    'Drainase jembatan & perlindungan gerusan (scour)',
    'Railing/pagar pengaman & rambu',
    'Pengujian & finishing',
  ],
  renovasi: [
    'Survei kondisi eksisting & pengukuran ulang',
    'Pekerjaan bongkaran terpilih (bagian yang direnovasi saja)',
    'Perbaikan/penggantian per bagian (dapur, kamar mandi, atap, dst. sesuai cakupan)',
    'Pekerjaan plumbing & elektrikal pada bagian terkait',
    'Finishing ulang (keramik, cat, plafon) pada bagian terkait',
    'Pembersihan & serah terima',
  ],
  kolam: [
    'Galian & pekerjaan tanah kolam',
    'Struktur kolam (lantai & dinding beton bertulang)',
    'Waterproofing kolam',
    'Finishing kolam (keramik/mozaik)',
    'Sistem sirkulasi, filter & pompa',
    'Plumbing pengisian & pembuangan',
    'Deck & area sekitar kolam',
    'Elektrikal & penerangan kolam',
  ],
  // --- Entri scope engine (G3): sejajar SCOPE_GROUPS. Isi diturunkan
  // dari CONSTRUCTION_KNOWLEDGE.conceptualWbs (record tercantum per
  // entri); 'jembatan' + 'renovasi' sudah ada di atas sebagai kunci
  // ganda. Tanpa angka — label BUKAN BOQ tetap berlaku (lihat header).
  // Record: 'jalan' (+ 'jalan-beton'/'jalan-aspal' sebagai varian).
  jalan: [
    'Pekerjaan persiapan & pembersihan lahan',
    'Pekerjaan tanah & lapis pondasi',
    'Perkerasan (aspal/beton/paving — dipilih eksplisit)',
    'Bahu jalan, kanstin & marka',
    'Drainase tepi & pelengkap jalan',
  ],
  // Record: 'drainase' (+ 'box-culvert').
  drainase: [
    'Pekerjaan persiapan & pengukuran',
    'Galian saluran',
    'Pasangan saluran (batu/U-ditch/box culvert — dipilih eksplisit)',
    'Lantai kerja & headwall',
    'Tutup saluran & aksesoris',
    'Urugan kembali & perataan',
  ],
  // Record: 'irigasi'.
  irigasi: [
    'Pekerjaan persiapan & pengukuran',
    'Galian & pekerjaan tanah saluran',
    'Pasangan saluran',
    'Bangunan bagi & pintu air',
    'Plengsengan & perlindungan tebing',
    'Urugan kembali & perataan',
  ],
  // Record: 'pondasi-khusus' (digeneralisasi: jenis pondasi dipilih
  // eksplisit, bukan ditetapkan di sini).
  pondasi: [
    'Pekerjaan persiapan & penyelidikan tanah',
    'Galian & pekerjaan tanah pondasi',
    'Pondasi (telapak/pancang/bore pile — dipilih eksplisit)',
    'Pembesian, bekisting & pengecoran',
    'Pile cap & sloof',
    'Urugan kembali & perataan',
  ],
  // Record: 'struktur-beton-baja'.
  struktur: [
    'Pekerjaan persiapan & pengukuran',
    'Bekisting',
    'Pembesian',
    'Pengecoran beton / fabrikasi baja (dipilih eksplisit)',
    'Ereksi & perakitan struktur',
    'Perawatan beton & pembongkaran bekisting',
  ],
  // Record: 'atap'.
  atap: [
    'Pekerjaan persiapan & pengukuran',
    'Rangka atap',
    'Penutup atap',
    'Lisplank & talang',
    'Waterproofing',
  ],
  // Record: 'finishing'.
  finishing: [
    'Pekerjaan persiapan & pengukuran',
    'Plester & acian',
    'Penutup lantai & dinding',
    'Plafon',
    'Pintu & jendela',
    'Pengecatan',
  ],
  // Record: 'kantor' (digeneralisasi: 'struktur bertingkat' menjadi
  // struktur umum agar berlaku untuk gedung berapa pun lantainya).
  gedung: [
    'Pekerjaan persiapan & pengukuran',
    'Pekerjaan tanah & pondasi',
    'Pekerjaan struktur (kolom, balok, pelat)',
    'Pekerjaan dinding & partisi',
    'Pekerjaan atap/dak',
    'Pekerjaan MEP (listrik, air, sanitasi)',
    'Pekerjaan finishing interior',
    'Pekerjaan lanskap & area luar',
  ],
  // Record: 'mep'.
  mep: [
    'Pekerjaan persiapan & pengukuran',
    'Instalasi listrik & panel',
    'Instalasi air bersih',
    'Instalasi air kotor & septic tank/IPAL',
    'Pompa & tangki air',
    'AC & ventilasi',
    'Hydrant & proteksi kebakaran',
  ],
  // Record: 'sanitasi'.
  sanitasi: [
    'Pekerjaan persiapan & pengukuran',
    'Galian & pekerjaan tanah saluran',
    'Jaringan air kotor',
    'Septic tank / IPAL',
    'Resapan',
    'Sanitair',
  ],
  // Record: 'pagar' + 'parkir-garasi'.
  lanskap: [
    'Pekerjaan persiapan & pembersihan lahan',
    'Perkerasan area & jalur',
    'Pondasi & pasangan pagar',
    'Gerbang & pos',
    'Drainase & penerangan area',
    'Tanaman & softscape',
    'Finishing area luar',
  ],
  // Record: 'demolisi'.
  demolisi: [
    'Survei kondisi eksisting & pengamanan area',
    'Pemutusan utilitas eksisting',
    'Pembongkaran struktur',
    'Pemilahan & pembuangan puing',
    'Pembersihan & perataan lahan',
  ],
  // Record: 'pelabuhan'.
  pelabuhan: [
    'Pekerjaan persiapan & akses kerja',
    'Pengerukan',
    'Struktur dermaga / penahan gelombang',
    'Apron & utilitas kawasan',
    'Fasilitas keselamatan & rambu',
  ],
  // Record: 'lapangan-olahraga' + 'gedung-olahraga'.
  olahraga: [
    'Pekerjaan persiapan & pengukuran',
    'Pekerjaan tanah & drainase lapangan',
    'Lapis dasar & permukaan lapangan',
    'Garis lapangan & peralatan olahraga',
    'Tribun & fasilitas pendukung',
    'Utilitas & penerangan lapangan',
  ],
  // Record: 'pertanian'.
  pertanian: [
    'Pekerjaan persiapan & pembersihan lahan',
    'Pekerjaan tanah',
    'Pondasi sederhana',
    'Struktur ringan',
    'Dinding & atap',
    'Utilitas dasar',
  ],
  // Record: 'pekerjaan-tanah'.
  tanah: [
    'Survei & pengukuran',
    'Pembersihan lahan',
    'Galian',
    'Urugan & pemadatan',
    'Perataan',
  ],
};

/** WBS konseptual untuk subkategori (null bila tidak ada peta khusus). */
export function conceptualWbsFor(subcategoryId: string | null | undefined): string[] | null {
  if (!subcategoryId) return null;
  return WBS[subcategoryId] ?? null;
}

/** Baris brief untuk WBS konseptual (selalu berlabel jujur). */
export function conceptualWbsLines(subcategoryId: string | null | undefined): string[] {
  const wbs = conceptualWbsFor(subcategoryId);
  if (!wbs) return [];
  return [
    '',
    `**${CONCEPTUAL_WBS_LABEL}:**`,
    ...wbs.map((w, i) => `${i + 1}. ${w}`),
  ];
}

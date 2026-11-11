/**
 * conceptualWbs.ts — WBS KONSEPTUAL per kategori proyek (Gelombang A,
 * Fase 6). Struktur paket pekerjaan konseptual untuk diskusi & brief:
 * membantu percakapan teknis dan kesiapan draft manual/non-AHSP.
 *
 * LABEL WAJIB: WBS ini KONSEPTUAL — bukan BOQ terverifikasi, bukan
 * AHSP, dan tidak memuat angka/volume/harga apa pun. Susunan final
 * BOQ tetap ditentukan engine katalog (universalRab) dari template
 * resmi, atau item manual berlabel jujur yang dibuat pengguna.
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

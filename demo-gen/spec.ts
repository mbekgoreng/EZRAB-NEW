/**
 * Spesifikasi dataset demo premium — INPUT DEMONSTRASI (bukan data resmi).
 * name  : nama pekerjaan RAB (bahasa estimator).
 * code  : kode AHSP yang diklaim dari katalog kanonis (diverifikasi generator
 *         lewat gerbang resolveCanonicalCode + penjaga spesifikasi; klaim yang
 *         gagal TIDAK dipaksakan — item menjadi UNRESOLVED).
 * qty/basis: kuantitas dari asumsi geometri contoh yang dinyatakan eksplisit.
 *
 * PARAMETER DESAIN (revisi owner 2026-10-30): lahan 8 × 14 m = 112 m²;
 * tapak lantai 1: 8 × 9 m = 72 m²; pelat lantai 2: 8 × 8 m = 64 m²
 * (mundur 1 m di sisi depan menjadi balkon); GFA 136 m²; tinggi lantai
 * Lt1 3,60 m / Lt2 3,40 m; grid kolom 3 × 4 = 12 titik (bentang 4,0 × 3,0 m);
 * pondasi telapak 12 titik; sloof mengikuti garis grid 59 m.
 */
export interface DemoSpecItem {
  s: number; // indeks section 1..20
  name: string;
  unit: string;
  qty: number;
  basis: string;
  code?: string;
  spec?: string;
}

export const SECTIONS: string[] = [
  '01. Persyaratan Umum & Preliminari',
  '02. Persiapan Lahan',
  '03. Pekerjaan Tanah',
  '04. Pondasi & Struktur Bawah',
  '05. Struktur Beton Bertulang',
  '06. Dinding & Partisi',
  '07. Pekerjaan Atap',
  '08. Waterproofing & Proteksi Kelembapan',
  '09. Finishing Lantai',
  '10. Finishing Dinding',
  '11. Pekerjaan Plafon',
  '12. Pintu, Jendela & Kusen',
  '13. Instalasi Listrik',
  '14. Plambing — Air Bersih',
  '15. Sanitasi & Air Kotor',
  '16. HVAC & Ventilasi',
  '17. Sistem Tegangan Rendah & Komunikasi',
  '18. Pekerjaan Luar & Lansekap',
  '19. Perabot Tetap & Elemen Built-in',
  '20. Pengujian, Komisioning & Serah Terima',
];

export const SPEC: DemoSpecItem[] = [
  // ---------- 01. Persyaratan Umum & Preliminari ----------
  { s: 1, name: 'Mobilisasi dan demobilisasi alat serta personil', unit: 'ls', qty: 1, basis: 'Lump sum 1 paket awal dan akhir proyek (asumsi contoh).' },
  { s: 1, name: 'Pagar sementara seng gelombang rangka kayu tinggi 2 m', unit: "m'", qty: 44, basis: 'Keliling lahan 2 × (8 + 14) m = 44 m selama konstruksi.', code: '1.1.1.2' },
  { s: 1, name: 'Papan nama proyek ukuran 0,8 × 1,2 m', unit: 'buah', qty: 1, basis: '1 buah di akses utama lahan.', code: '1.1.2.1' },
  { s: 1, name: 'Kantor sementara, rumah jaga dan gudang semen/peralatan', unit: 'm2', qty: 9, basis: 'Bangunan sementara 3 × 3 m = 9 m².', code: '1.1.2.3' },
  { s: 1, name: 'Penyediaan air kerja selama pelaksanaan', unit: 'bulan', qty: 6, basis: 'Durasi contoh 6 bulan; sambungan sementara + tandon kerja.' },
  { s: 1, name: 'Penyediaan listrik kerja selama pelaksanaan', unit: 'bulan', qty: 6, basis: 'Durasi contoh 6 bulan; sambungan sementara PLN.' },
  { s: 1, name: 'Pengukuran dan pematokan ulang (setting out) bangunan', unit: 'ls', qty: 1, basis: '1 paket penentuan as bangunan dan benchmark lokal.' },
  { s: 1, name: 'Dokumentasi dan administrasi proyek (foto kemajuan, laporan)', unit: 'ls', qty: 1, basis: '1 paket selama proyek.' },
  { s: 1, name: 'Keselamatan dan kesehatan kerja (rambu, APD dasar, P3K)', unit: 'ls', qty: 1, basis: '1 paket K3 dasar proyek rumah tinggal.' },
  { s: 1, name: 'Pengamanan lokasi proyek (penjagaan)', unit: 'bulan', qty: 6, basis: '1 petugas jaga × 6 bulan (asumsi contoh).' },
  { s: 1, name: 'Pengelolaan limbah dan sisa material konstruksi', unit: 'ls', qty: 1, basis: '1 paket pengumpulan dan pembuangan berkala.' },
  { s: 1, name: 'Pengendalian mutu berkala (slump test lapangan, inspeksi bekisting)', unit: 'ls', qty: 1, basis: '1 paket QC lapangan; uji laboratorium di Seksi 20.' },

  // ---------- 02. Persiapan Lahan ----------
  { s: 2, name: 'Pembersihan dan pengupasan permukaan tanah (striping)', unit: 'm2', qty: 112, basis: 'Seluruh lahan 8 × 14 m = 112 m².', code: '1.1.3.1' },
  { s: 2, name: 'Tebas tebang pohon diameter 15–30 cm', unit: 'btg', qty: 2, basis: '2 batang pohon eksisting di area tapak (survei contoh).', code: '1.1.3.4' },
  { s: 2, name: "Pasangan bouwplank", unit: "m'", qty: 38.8, basis: 'Keliling garis as + offset 0,6 m: 2 × ((8 + 1,2) + (9 + 1,2)) = 38,8 m.', code: '1.1.4.2' },
  { s: 2, name: 'Drainase sementara keliling lahan selama konstruksi', unit: "m'", qty: 28, basis: 'Saluran tanah sementara 2 sisi lahan: 2 × 14 m = 28 m.' },
  { s: 2, name: 'Proteksi properti tetangga (penutup paranet dan seng bekas)', unit: "m'", qty: 14, basis: 'Sisi berbatasan bangunan tetangga terpadat: 14 m.' },

  // ---------- 03. Pekerjaan Tanah ----------
  { s: 3, name: 'Galian tanah pondasi telapak sedalam > 1 s.d. 2 m', unit: 'm3', qty: 49.15, basis: '12 titik × lubang 1,6 × 1,6 × 1,6 m (termasuk ruang kerja) = 49,15 m³.', code: '1.2.1.1.4' },
  { s: 3, name: 'Galian tanah alur sloof dan lantai sedalam 0 s.d. 1 m', unit: 'm3', qty: 21.24, basis: 'Alur sloof 59 m × lebar 0,6 m × dalam 0,6 m = 21,24 m³.', code: '1.2.1.1.1' },
  { s: 3, name: 'Galian tanah septic tank dan sumur resapan', unit: 'm3', qty: 5.4, basis: 'STP 1,8 × 1,2 × 1,8 m (3,9) + sumur resapan 1,0 × 1,0 × 1,5 m (1,5) = 5,4 m³.', code: '1.2.1.1.1' },
  { s: 3, name: 'Galian tanah saluran drainase halaman', unit: 'm3', qty: 7.5, basis: '25 m × 0,5 m × 0,6 m = 7,5 m³.', code: '1.2.1.1.1' },
  { s: 3, name: 'Pembuangan tanah galian keluar lokasi proyek', unit: 'm3', qty: 43, basis: 'Sisa galian setelah urugan kembali: total galian 83,3 − dipakai kembali ±40 = ±43 m³ (asumsi contoh).' },
  { s: 3, name: 'Urugan kembali galian tanah dengan pemadatan manual', unit: 'm3', qty: 40, basis: 'Sela pondasi dan alur: ±40 m³ dari galian yang dipakai kembali.' },
  { s: 3, name: 'Urugan pasir uruk bawah pondasi dan lantai', unit: 'm3', qty: 5.33, basis: 'Bawah telapak 12 × 1,44 m² × 0,10 m (1,73) + bawah lantai dasar 72 m² × 0,05 m (3,60) = 5,33 m³.', code: '1.3.1.2' },
  { s: 3, name: 'Urugan tanah peninggian lantai dan halaman', unit: 'm3', qty: 11, basis: '72 m² × tebal rata-rata 0,15 m = 10,8 ≈ 11 m³.', code: '1.3.1.4' },
  { s: 3, name: 'Pemadatan tanah dasar per lapis 20 cm (timbris manual)', unit: 'm3', qty: 14.4, basis: 'Tapak lantai dasar 72 m² × 1 lapis 0,20 m = 14,4 m³ tanah dipadatkan.', code: '1.3.2.1' },

  // ---------- 04. Pondasi & Struktur Bawah ----------
  { s: 4, name: "Pengecoran beton ready mixed f'c 10 MPa — lantai kerja pondasi", unit: 'm3', qty: 1.18, basis: '12 titik × alas 1,4 × 1,4 m × tebal 0,05 m = 1,18 m³.', code: '2.2.1.6.1', spec: "beton f'c 10 MPa" },
  { s: 4, name: 'Pondasi batu kosong (anstamping) bawah telapak', unit: 'm3', qty: 2.59, basis: '12 titik × 1,2 × 1,2 m × tebal 0,15 m = 2,59 m³.', code: '2.2.2.1.1' },
  { s: 4, name: "Beton mutu sedang f'c 20 MPa semi mekanis — pondasi telapak", unit: 'm3', qty: 5.18, basis: '12 titik × 1,2 × 1,2 × 0,30 m = 5,18 m³.', code: '2.2.1.5.4', spec: "beton f'c 20 MPa" },
  { s: 4, name: 'Penulangan pondasi telapak BjTS diameter ≥ 12 mm', unit: 'kg', qty: 466, basis: 'Estimasi berbasis rasio desain contoh 90 kg/m³ × 5,18 m³ = 466 kg. WAJIB dikonfirmasi gambar struktur (bar schedule).', code: '2.2.1.1.2a' },
  { s: 4, name: 'Bekisting pondasi telapak (3 kali pakai)', unit: 'm2', qty: 17.28, basis: '12 titik × keliling 4 × 1,2 m × tinggi 0,30 m = 17,28 m².', code: '2.2.1.3.1' },
  { s: 4, name: "Beton mutu sedang f'c 20 MPa semi mekanis — sloof 15/20", unit: 'm3', qty: 1.77, basis: 'Panjang sloof semua garis grid 59 m × 0,15 × 0,20 m = 1,77 m³.', code: '2.2.1.5.4', spec: "beton f'c 20 MPa" },
  { s: 4, name: 'Penulangan sloof BjTP diameter < 12 mm', unit: 'kg', qty: 248, basis: 'Estimasi rasio desain contoh 140 kg/m³ × 1,77 m³ = 248 kg. Konfirmasi bar schedule.', code: '2.2.1.1.3' },
  { s: 4, name: 'Bekisting sloof (3 kali pakai)', unit: 'm2', qty: 23.6, basis: '2 sisi × 59 m × 0,20 m = 23,6 m² (memakai item bekisting balok).', code: '2.2.1.3.4' },
  { s: 4, name: "Beton mutu sedang f'c 20 MPa semi mekanis — kolom pedestal", unit: 'm3', qty: 0.68, basis: '12 pedestal 0,25 × 0,25 × 0,90 m = 0,68 m³.', code: '2.2.1.5.4', spec: "beton f'c 20 MPa" },
  { s: 4, name: 'Penulangan kolom pedestal BjTP diameter < 12 mm', unit: 'kg', qty: 81, basis: 'Estimasi rasio 120 kg/m³ × 0,68 m³ = 81 kg. Konfirmasi bar schedule.', code: '2.2.1.1.3' },
  { s: 4, name: 'Bekisting kolom pedestal (3 kali pakai)', unit: 'm2', qty: 10.8, basis: '12 titik × 4 sisi × 0,25 m × 0,90 m = 10,8 m².', code: '2.2.1.3.3' },
  { s: 4, name: "Pengecoran beton ready mixed f'c 10 MPa — lantai kerja lantai dasar", unit: 'm3', qty: 3.6, basis: '72 m² × tebal 0,05 m = 3,60 m³.', code: '2.2.1.6.1', spec: "beton f'c 10 MPa" },
  { s: 4, name: "Beton mutu sedang f'c 20 MPa semi mekanis — plat lantai dasar", unit: 'm3', qty: 7.2, basis: '72 m² × tebal 0,10 m = 7,20 m³.', code: '2.2.1.5.4', spec: "beton f'c 20 MPa" },
  { s: 4, name: 'Penulangan plat lantai dasar BjTP diameter < 12 mm', unit: 'kg', qty: 432, basis: 'Estimasi wiremesh/tulangan susut 6 kg/m² × 72 m² = 432 kg. Konfirmasi gambar struktur.', code: '2.2.1.1.1' },

  // ---------- 05. Struktur Beton Bertulang ----------
  { s: 5, name: "Beton mutu sedang f'c 20 MPa semi mekanis — kolom lantai 1", unit: 'm3', qty: 2.7, basis: '12 kolom 0,25 × 0,25 m × tinggi 3,60 m = 2,70 m³.', code: '2.2.1.5.4', spec: "beton f'c 20 MPa" },
  { s: 5, name: "Beton mutu sedang f'c 20 MPa semi mekanis — kolom lantai 2", unit: 'm3', qty: 2.13, basis: '10 kolom (2 hilang di void tangga/balkon) 0,25 × 0,25 m × 3,40 m = 2,13 m³.', code: '2.2.1.5.4', spec: "beton f'c 20 MPa" },
  { s: 5, name: 'Penulangan kolom lantai 1 BjTP diameter < 12 mm', unit: 'kg', qty: 432, basis: 'Estimasi rasio 160 kg/m³ × 2,70 m³ = 432 kg. Konfirmasi bar schedule.', code: '2.2.1.1.3' },
  { s: 5, name: 'Penulangan kolom lantai 2 BjTP diameter < 12 mm', unit: 'kg', qty: 340, basis: 'Estimasi rasio 160 kg/m³ × 2,13 m³ = 340 kg. Konfirmasi bar schedule.', code: '2.2.1.1.3' },
  { s: 5, name: 'Bekisting kolom lantai 1 (3 kali pakai)', unit: 'm2', qty: 43.2, basis: '12 kolom × 4 × 0,25 m × 3,60 m = 43,2 m².', code: '2.2.1.3.3' },
  { s: 5, name: 'Bekisting kolom lantai 2 (3 kali pakai)', unit: 'm2', qty: 34, basis: '10 kolom × 4 × 0,25 m × 3,40 m = 34 m².', code: '2.2.1.3.3' },
  { s: 5, name: "Beton mutu sedang f'c 20 MPa semi mekanis — balok lantai 2", unit: 'm3', qty: 4.48, basis: 'Balok 20/40 mengikuti garis grid pelat lantai 2 (keliling 32 m + garis dalam 24 m = 56 m): 56 × 0,20 × 0,40 = 4,48 m³.', code: '2.2.1.5.4', spec: "beton f'c 20 MPa" },
  { s: 5, name: 'Penulangan balok lantai 2 BjTP diameter < 12 mm', unit: 'kg', qty: 672, basis: 'Estimasi rasio 150 kg/m³ × 4,48 m³ = 672 kg. Konfirmasi bar schedule.', code: '2.2.1.1.3' },
  { s: 5, name: 'Bekisting balok lantai 2 (3 kali pakai)', unit: 'm2', qty: 56, basis: '(2 sisi × 0,40 + alas 0,20) × 56 m = 56 m².', code: '2.2.1.3.4' },
  { s: 5, name: "Beton mutu sedang f'c 20 MPa semi mekanis — plat lantai 2", unit: 'm3', qty: 7.68, basis: 'Plat 64 m² × tebal 0,12 m = 7,68 m³ (pelat lantai 2 seluas 8 × 8 m).', code: '2.2.1.5.4', spec: "beton f'c 20 MPa" },
  { s: 5, name: 'Penulangan plat lantai 2 BjTP diameter < 12 mm', unit: 'kg', qty: 576, basis: 'Estimasi rasio plat dua arah 75 kg/m³ × 7,68 m³ = 576 kg. Konfirmasi bar schedule.', code: '2.2.1.1.1' },
  { s: 5, name: 'Bekisting plat lantai 2 (3 kali pakai)', unit: 'm2', qty: 64, basis: 'Soffit plat 64 m² (sisi tepi mengikuti bekisting balok).', code: '2.2.1.3.5' },
  { s: 5, name: "Beton mutu sedang f'c 20 MPa semi mekanis — ring balk lantai 2", unit: 'm3', qty: 1.68, basis: 'Ring balk 15/20 keliling + garis dalam 56 m: 56 × 0,15 × 0,20 = 1,68 m³.', code: '2.2.1.5.4', spec: "beton f'c 20 MPa" },
  { s: 5, name: 'Penulangan ring balk BjTP diameter < 12 mm', unit: 'kg', qty: 218, basis: 'Estimasi rasio 130 kg/m³ × 1,68 m³ = 218 kg. Konfirmasi bar schedule.', code: '2.2.1.1.3' },
  { s: 5, name: 'Bekisting ring balk (3 kali pakai)', unit: 'm2', qty: 22.4, basis: '2 sisi × 56 m × 0,20 m = 22,4 m² (memakai item bekisting balok).', code: '2.2.1.3.4' },
  { s: 5, name: "Beton mutu sedang f'c 20 MPa semi mekanis — tangga", unit: 'm3', qty: 1.7, basis: 'Volume pendekatan tangga 2 jalur + bordes = 1,70 m³ (dari gambar contoh).', code: '2.2.1.5.4', spec: "beton f'c 20 MPa" },
  { s: 5, name: 'Penulangan tangga BjTP diameter < 12 mm', unit: 'kg', qty: 187, basis: 'Estimasi rasio 110 kg/m³ × 1,70 m³ = 187 kg. Konfirmasi bar schedule.', code: '2.2.1.1.3' },
  { s: 5, name: 'Bekisting tangga (3 kali pakai)', unit: 'm2', qty: 11, basis: 'Bidang kontak pendekatan 11 m² (2 jalur + bordes).', code: '2.2.1.3.7' },
  { s: 5, name: "Kolom praktis beton bertulang 11 × 11", unit: "m'", qty: 50, basis: 'Kolom praktis di sudut dinding dan sisi bukaan: ±50 m total.', code: '2.2.1.10.1' },
  { s: 5, name: "Balok praktis (latei) beton bertulang 10 × 15", unit: "m'", qty: 34, basis: 'Latei di atas bukaan pintu/jendela: ±34 m total.', code: '2.2.1.10.2' },

  // ---------- 06. Dinding & Partisi ----------
  { s: 6, name: 'Dinding bata merah tebal 1/2 batu — eksterior lantai 1', unit: 'm2', qty: 107, basis: 'Keliling 34 m × 3,60 m = 122,4 m² kotor − bukaan 15 m² (aturan: bukaan dikurangkan penuh) = 107 m² (dibulatkan).', code: '3.6.1.6' },
  { s: 6, name: 'Dinding bata merah tebal 1/2 batu — eksterior lantai 2', unit: 'm2', qty: 95, basis: 'Keliling 32 m × 3,40 m = 108,8 m² kotor − bukaan 14 m² = 95 m² (dibulatkan).', code: '3.6.1.6' },
  { s: 6, name: 'Dinding bata merah tebal 1/2 batu — area basah (KM/WC)', unit: 'm2', qty: 61, basis: 'KM lantai 1: 7 m × 3,60 − 2 = 23 m²; KM lantai 2 (2 ruang): 12 m × 3,40 − 3 = 38 m². Total 61 m².', code: '3.6.1.6' },
  { s: 6, name: 'Dinding bata ringan tebal 10 cm — partisi lantai 1', unit: 'm2', qty: 60, basis: 'Partisi non-KM 18 m × 3,60 m = 64,8 m² − bukaan 5 m² = 60 m² (dibulatkan).', code: '3.6.4.2' },
  { s: 6, name: 'Dinding bata ringan tebal 10 cm — partisi lantai 2', unit: 'm2', qty: 31, basis: 'Partisi non-KM 10 m × 3,40 m = 34 m² − bukaan 3 m² = 31 m².', code: '3.6.4.2' },

  // ---------- 07. Pekerjaan Atap ----------
  { s: 7, name: 'Rangka atap pelana baja ringan profil C75', unit: 'm2', qty: 106, basis: 'Bidang miring atap: 2 sisi × 10 m (panjang + overhang) × 5,3 m (bentang miring 4,6 m pada kemiringan 30° + overhang) = 106 m².', code: '2.1.1.1' },
  { s: 7, name: 'Penutup atap genteng beton', unit: 'm2', qty: 106, basis: 'Mengikuti bidang rangka atap 106 m².', code: '3.1.1.4' },
  { s: 7, name: "Nok/bubungan genteng", unit: "m'", qty: 10, basis: 'Garis bubungan atap pelana 10 m.' },
  { s: 7, name: 'Lembaran insulasi atap', unit: 'm2', qty: 106, basis: 'Di bawah penutup atap, mengikuti bidang atap 106 m².', code: '3.2.1' },
  { s: 7, name: "Talang 1/2 lingkaran diameter 15 cm seng plat", unit: "m'", qty: 20, basis: '2 sisi eaves × 10 m = 20 m.', code: '3.3.2' },
  { s: 7, name: 'Pipa turun air hujan PVC diameter 3 inci', unit: "m'", qty: 28, basis: '4 titik × tinggi 7,0 m = 28 m.' },
  { s: 7, name: "Lisplank kayu 3 × 20 cm", unit: "m'", qty: 38, basis: 'Keliling eaves dan gable 2 × (10 + 9) m = 38 m.', code: '3.3.3' },
  { s: 7, name: 'Flashing pertemuan atap dan dinding', unit: "m'", qty: 8, basis: 'Pertemuan atap teras dengan dinding utama 8 m.' },
];

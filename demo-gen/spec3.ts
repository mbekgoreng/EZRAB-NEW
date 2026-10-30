import type { DemoSpecItem } from './spec';

export const SPEC3: DemoSpecItem[] = [
  // ---------- 15. Sanitasi & Air Kotor ----------
  { s: 15, name: 'Kloset duduk/monoblock', unit: 'buah', qty: 3, basis: '3 KM/WC (jadwal ruang contoh).', code: '3.18.3.1' },
  { s: 15, name: 'Wastafel', unit: 'buah', qty: 3, basis: '1 per KM/WC = 3 buah.', code: '3.18.1.1' },
  { s: 15, name: 'Bak cuci piring stainless steel — dapur', unit: 'buah', qty: 1, basis: '1 unit di dapur.', code: '3.18.2.1' },
  { s: 15, name: 'Shower set', unit: 'buah', qty: 2, basis: '2 KM lantai 2 dengan shower (KM lantai 1 memakai bak).', code: '3.18.6.9' },
  { s: 15, name: 'Bak mandi fiberglass volume 0,3 m3', unit: 'buah', qty: 1, basis: 'KM lantai 1 (tamu) 1 unit.', code: '3.18.5.3' },
  { s: 15, name: 'Floor drain stainless steel', unit: 'buah', qty: 4, basis: '3 KM + 1 area cuci = 4 buah.', code: '3.18.6.1' },
  { s: 15, name: "Pipa PVC D diameter 4 inci — soil kloset ke STP", unit: "m'", qty: 26, basis: 'Rute contoh 3 KM ke STP di halaman belakang ±26 m. Kelas D untuk saluran buangan gravitasi.', code: '6.4.1.22' },
  { s: 15, name: "Pipa PVC D diameter 3 inci — wastafel, floor drain, dapur", unit: "m'", qty: 20, basis: 'Rute contoh gabungan titik buangan ±20 m. Kelas D untuk saluran buangan gravitasi.', code: '6.4.1.21' },
  { s: 15, name: "Pipa PVC D diameter 2 inci — ventilasi pipa soil", unit: "m'", qty: 10, basis: 'Ventilasi pipa soil ke atas atap 2 jalur ±10 m.', code: '6.4.1.19' },
  { s: 15, name: 'Bak kontrol pasangan bata 45 × 45 cm', unit: 'buah', qty: 3, basis: '3 titik belokan/percabangan saluran buangan.', code: '6.3.2' },
  { s: 15, name: 'Sewage Treatment Plant (STP) fiberglass kapasitas 2 m3', unit: 'set', qty: 1, basis: 'Sistem sanitasi terpilih: STP biofilter + sumur resapan (bukan septic tank konvensional).', code: '6.2.1.1' },
  { s: 15, name: 'Sumur resapan air limbah diameter 80 cm', unit: 'unit', qty: 1, basis: 'Resapan efluen STP 1 buah.', code: '6.2.4.1' },
  { s: 15, name: 'Grease trap dapur', unit: 'buah', qty: 1, basis: '1 buah sebelum bak kontrol dapur.' },
  { s: 15, name: 'Cleanout (tutup pembersih) pipa buangan', unit: 'buah', qty: 3, basis: '3 titik akses pembersihan saluran.' },

  // ---------- 16. HVAC & Ventilasi ----------
  { s: 16, name: 'AC wall mounted kapasitas 9.000 BTUH — kamar tidur utama', unit: 'unit', qty: 1, basis: 'Hanya ruang ber-AC terpilih (bukan semua ruang).', code: '5.5.1.4', spec: 'AC 9.000 BTUH' },
  { s: 16, name: 'AC wall mounted kapasitas 7.000 BTUH — kamar tidur 2 dan 3', unit: 'unit', qty: 2, basis: '2 kamar anak/tamu.', code: '5.5.1.3', spec: 'AC 7.000 BTUH' },
  { s: 16, name: 'AC wall mounted kapasitas 12.000 BTUH — ruang keluarga lantai 1', unit: 'unit', qty: 1, basis: '1 unit ruang keluarga.', code: '5.5.1.5', spec: 'AC 12.000 BTUH' },
  { s: 16, name: "Pipa tembaga refrigerant AC diameter 1/2 inci", unit: "m'", qty: 22, basis: '4 unit × rute rata-rata 5,5 m = 22 m (pasangan liquid/gas dihitung per rute contoh).', code: '5.5.4.3' },
  { s: 16, name: 'Insulasi pipa refrigerant (armaflex)', unit: "m'", qty: 22, basis: 'Mengikuti panjang pipa tembaga 22 m.' },
  { s: 16, name: "Pipa drain AC PVC AW 3/4 inci", unit: "m'", qty: 18, basis: 'Drain kondensat 4 unit ke titik buangan ±18 m.', code: '6.4.1.2' },
  { s: 16, name: 'Ceiling exhaust fan 100 CFM — kamar mandi', unit: 'unit', qty: 3, basis: '1 per KM/WC = 3 unit.', code: '5.5.2.3' },
  { s: 16, name: 'Exhaust grille 150 × 150 mm', unit: 'unit', qty: 3, basis: 'Mengikuti exhaust fan KM: 3 unit.', code: '5.5.2.31' },

  // ---------- 17. Tegangan Rendah & Komunikasi ----------
  { s: 17, name: 'Instalasi titik kamera CCTV', unit: 'titik', qty: 4, basis: '4 titik: depan, carport, samping, belakang.', code: '5.4.2.11' },
  { s: 17, name: 'Kamera CCTV outdoor smart wifi 360', unit: 'unit', qty: 2, basis: '2 kamera luar (depan dan belakang). Pengadaan peralatan — katalog hanya punya padanan per titik instalasi, bukan per unit kamera.' },
  { s: 17, name: 'Kamera CCTV indoor fixed dome IP', unit: 'unit', qty: 2, basis: 'Ruang keluarga 2 lantai (peralatan contoh).', code: '5.4.2.9' },
  { s: 17, name: 'Instalasi intercom jack', unit: 'titik', qty: 1, basis: '1 titik di pintu utama.', code: '5.4.1.24' },
  { s: 17, name: 'Instalasi titik TV', unit: 'titik', qty: 3, basis: 'Ruang keluarga 2 + kamar utama 1 = 3 titik.', code: '5.4.6.1' },
  { s: 17, name: 'Antena UHF', unit: 'unit', qty: 1, basis: '1 antena atap.', code: '5.4.6.5' },
  { s: 17, name: 'Main switch hub 12 port — jaringan data', unit: 'unit', qty: 1, basis: '1 switch di panel komunikasi.', code: '5.4.5.3' },
  { s: 17, name: 'Router broadband', unit: 'unit', qty: 1, basis: '1 unit gateway internet.', code: '5.4.5.4' },
  { s: 17, name: 'Outlet data LAN (RJ45) termasuk kabel UTP Cat6', unit: 'titik', qty: 4, basis: '4 titik: ruang kerja, keluarga 2 lantai, kamar utama.' },
  { s: 17, name: 'Access point wifi ceiling', unit: 'unit', qty: 2, basis: '1 per lantai.', code: '5.4.5.10' },
  { s: 17, name: 'Bel pintu (doorbell) nirkabel', unit: 'set', qty: 1, basis: '1 set di gerbang/pintu utama.' },

  // ---------- 18. Pekerjaan Luar & Lansekap ----------
  { s: 18, name: "Paving block natural tebal 6 cm f'c 20 MPa — carport dan akses masuk", unit: 'm2', qty: 25, basis: 'Carport 3,5 × 5 m (17,5) + jalur masuk 7,5 m² = 25 m².', code: '7.1.1.1' },
  { s: 18, name: "Paving block natural tebal 6 cm f'c 20 MPa — jalur pedestrian halaman", unit: 'm2', qty: 8, basis: 'Jalur pedestrian halaman belakang/samping 8 m².', code: '7.1.1.1' },
  { s: 18, name: "Saluran U-ditch 30 × 30 cm — drainase depan", unit: "m'", qty: 8, basis: 'Sepanjang muka lahan 8 m.', code: '8.1.1.1' },
  { s: 18, name: "Saluran U-ditch 30 × 40 cm — drainase samping", unit: "m'", qty: 14, basis: 'Sisi samping lahan 14 m.', code: '8.1.1.2' },
  { s: 18, name: 'Sumur resapan air hujan diameter 80 cm', unit: 'buah', qty: 1, basis: 'Resapan air hujan atap 1 buah di halaman depan.', code: '6.6.1.1' },
  { s: 18, name: 'Pagar depan bata plester + besi tempa', unit: "m'", qty: 8, basis: 'Muka lahan 8 m termasuk kolom pagar (komposit contoh).' },
  { s: 18, name: 'Pintu gerbang besi geser lebar 3,5 m', unit: 'set', qty: 1, basis: '1 set gerbang carport.' },
  { s: 18, name: 'Pagar BRC galvanis — samping dan belakang', unit: 'm2', qty: 44, basis: 'Samping + belakang (14 + 8) m × tinggi 2 m = 44 m².', code: '1.1.1.5' },
  { s: 18, name: 'Urugan tanah taman dan tanah humus (topsoil)', unit: 'm3', qty: 2.7, basis: 'Area taman 18 m² × 0,15 m = 2,7 m³.', code: '1.3.1.4' },
  { s: 18, name: 'Penanaman rumput gajah mini (Axonopus compressus)', unit: 'm2', qty: 18, basis: 'Area taman 18 m² (di luar paving dan bangunan). Jenis rumput contoh yang dinyatakan eksplisit.', code: '4.1.6.2' },
  { s: 18, name: 'Penanaman semak Tabernac (Tabernaemontana) 12 buah/m2', unit: 'm2', qty: 4, basis: 'Bedeng semak pagar hidup 4 m².', code: '4.1.4.3.18' },
  { s: 18, name: 'Penanaman palem kuning (Dypsis lutescens)', unit: 'buah', qty: 2, basis: '2 rumpun palem aksen halaman depan.', code: '4.1.3.1.2' },
  { s: 18, name: 'Lampu taman LED 50 watt + tiang 3 m', unit: 'buah', qty: 2, basis: '2 titik taman depan.', code: '5.3.1.56' },
  { s: 18, name: 'Perataan akhir dan pembersihan halaman (grading)', unit: 'm2', qty: 40, basis: 'Area luar bangunan 112 − 72 tapak = 40 m².' },

  // ---------- 19. Perabot Tetap & Built-in ----------
  { s: 19, name: 'Meja dapur beton finishing granit termasuk lubang sink', unit: "m'", qty: 3.6, basis: 'Counter dapur 3,6 m (spesifikasi contoh).' },
  { s: 19, name: 'Kitchen set kabinet atas dan bawah', unit: "m'", qty: 3.6, basis: 'Mengikuti counter 3,6 m (spesifikasi contoh).' },
  { s: 19, name: 'Kaca cermin tebal 5 mm — kamar mandi', unit: 'm2', qty: 1.44, basis: '3 cermin × 0,6 × 0,8 m = 1,44 m².', code: '3.12.7' },
  { s: 19, name: "Railing tangga dan handrail besi", unit: "m'", qty: 8, basis: 'Sisi terbuka tangga 2 jalur ≈ 8 m.', code: '3.13.5' },
  { s: 19, name: "Railing besi pengaman balkon tinggi 1,2 m", unit: "m'", qty: 8, basis: 'Sisi terbuka balkon selebar muka bangunan 8 m.', code: '3.13.4' },
  { s: 19, name: 'Aksesoris kamar mandi (tempat sabun, gantungan handuk, tissue holder)', unit: 'set', qty: 3, basis: '1 set per KM/WC.' },
  { s: 19, name: 'Lemari pakaian built-in kamar utama', unit: 'set', qty: 1, basis: '1 set lemari tanam 2,4 × 2,6 m (spesifikasi contoh).' },

  // ---------- 20. Pengujian, Komisioning & Serah Terima ----------
  { s: 20, name: 'Pengujian instalasi listrik dan pengukuran tahanan pembumian', unit: 'ls', qty: 1, basis: '1 paket uji fungsi + ukur grounding (target ≤ 5 ohm, asumsi contoh).' },
  { s: 20, name: 'Uji tekanan (hydrotest) pipa air bersih', unit: 'ls', qty: 1, basis: '1 paket uji tekan seluruh jaringan PPR.' },
  { s: 20, name: 'Uji kebocoran dan aliran drainase/sanitasi', unit: 'ls', qty: 1, basis: '1 paket uji alir dan genangan saluran.' },
  { s: 20, name: 'Uji rendam (pond test) waterproofing KM dan balkon 24 jam', unit: 'ls', qty: 1, basis: '1 paket sebelum penutup keramik dipasang.' },
  { s: 20, name: 'Pengujian benda uji beton (kubus/silinder) laboratorium', unit: 'buah', qty: 9, basis: '3 titik cor × 3 benda uji (7/14/28 hari) = 9 buah.' },
  { s: 20, name: 'Komisioning AC, pompa dan panel listrik', unit: 'ls', qty: 1, basis: '1 paket start-up dan pengaturan awal sistem.' },
  { s: 20, name: 'Pembersihan akhir menyeluruh sebelum serah terima', unit: 'm2', qty: 136, basis: 'Seluruh luas lantai terbangun (GFA) 136 m².' },
  { s: 20, name: 'Inspeksi defect dan daftar perbaikan (punch list)', unit: 'ls', qty: 1, basis: '1 paket inspeksi bersama pemilik contoh.' },
  { s: 20, name: 'Gambar as-built dan dokumentasi serah terima', unit: 'ls', qty: 1, basis: '1 paket gambar terbangun + manual peralatan.' },
  { s: 20, name: 'Manual operasi dan pemeliharaan (O&M) serta pelatihan pemilik', unit: 'ls', qty: 1, basis: '1 paket dokumen dan sesi penjelasan.' },
];

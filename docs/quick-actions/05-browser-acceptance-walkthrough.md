# Quick Actions Acceptance Walkthrough

## Panduan Penerimaan Pengguna & Pengujian Interaktif di Browser

Dokumen ini memandu langkah-langkah verifikasi langsung (*End-to-End User Acceptance Test*) untuk memastikan seluruh 10 Quick Actions berfungsi dengan sempurna sebagai dialog AI interaktif di antarmuka pengguna EZRAB.

---

## 1. Persiapan Lingkungan
1. Jalankan aplikasi web lokal: `npm run dev`
2. Buka browser pada `http://localhost:5173/` (atau port Vite yang aktif).
3. Masuk ke proyek aktif (misal: *Rumah Tinggal Tropis Modern 2 Lantai*).
4. Buka AI CoAssistant (melalui floating widget di kanan bawah atau menu navigasi *AI Assistant* / *Magic AI*).

---

## 2. Skenario Pengujian Tiap Quick Action

### Skenario 1: Audit RAB (`AUDIT_RAB`)
1. **Aksi**: Klik tombol **Audit RAB** pada bilah Quick Actions.
2. **Ekspektasi Percakapan**:
   - Pesan pengguna otomatis muncul di chatbox: *"Audit RAB"*.
   - AI membalas dengan status kelayakan RAB, jumlah item pekerjaan, deteksi volume kosong (0), harga satuan kosong (0), dan nilai total RAB proyek.
   - Di bawah pesan AI muncul kartu ringkasan atau tabel temuan, serta tombol chip saran lanjutan (*"Periksa Item Tanpa AHSP"*, *"Bandingkan Harga Pasar"*).
3. **Kepatuhan Mutasi**: Tidak ada data database yang diubah tanpa persetujuan.

---

### Skenario 2: Hitung Volume QTO (`HITUNG_VOLUME`)
1. **Aksi**: Klik tombol **Hitung Volume**.
2. **Ekspektasi Percakapan**:
   - AI menanyakan jenis pekerjaan dan menyajikan kartu pilihan: `Kolom / Balok / Sloof`, `Pasangan Dinding Bata`, `Galian Tanah Pondasi`, `Plat Lantai Beton`.
3. **Pilihan Interaktif & Dual Input**:
   - **Metode A (Klik Kartu)**: Klik *"Kolom / Balok / Sloof"*, lalu isi input dimensi panjang, lebar, dan tinggi.
   - **Metode B (Ketik Teks Bebas)**: Ketik *"Panjang 6m, lebar 0.2m, tinggi 0.3m, jumlah 4 buah"*.
4. **Hasil**: AI menghitung secara deterministik ($6 \times 0.2 \times 0.3 \times 4 = 1.44\text{ m}^3$) dan menampilkan hasil perhitungan, rumus, dan tombol lanjutan.

---

### Skenario 3: Cari AHSP SNI PUPR (`CARI_AHSP`)
1. **Aksi**: Klik tombol **Cari AHSP**.
2. **Ekspektasi Percakapan**:
   - AI menanyakan kategori pekerjaan (*Pekerjaan Beton*, *Pekerjaan Tanah*, *Pekerjaan Pasangan & Dinding*).
   - Klik salah satu kategori atau ketik nama pekerjaan di kolom input.
3. **Hasil**: AI menyajikan tabel berisi Kode AHSP (misal: `A.4.1.1.5`), uraian pekerjaan, satuan, koefisien, dan estimasi biaya.

---

### Skenario 4: Cari Harga Pasar & Acuan (`CARI_HARGA`)
1. **Aksi**: Klik tombol **Cari Harga**.
2. **Ekspektasi Percakapan**:
   - AI menanyakan jenis sumber daya (*Material Bahan*, *Upah Tenaga Kerja*, *Sewa Alat Berat*).
   - Pengguna memilih material atau mengetik *"Harga semen dan pasir di Jakarta"*.
3. **Hasil**: Tabel harga acuan pasar dan standar PUPR terbaru disajikan.

---

### Skenario 5: Analisis Gambar Kerja DED (`ANALISIS_DED`)
1. **Aksi**: Klik tombol **Analisis DED**.
2. **Ekspektasi Percakapan**:
   - AI menanyakan dokumen gambar yang ingin dianalisis (*Denah Arsitektur*, *Rencana Pondasi*, *Potongan Struktur*).
   - Pengguna memilih denah arsitektur.
3. **Hasil**: AI mengekstrak dimensi luas lantai, modul kolom, sloof, dan kelengkapan elevasi dengan confidence score.

---

### Skenario 6: Buat Laporan Proyek (`BUAT_LAPORAN`) — *Mutating Action*
1. **Aksi**: Klik tombol **Buat Laporan**.
2. **Ekspektasi Percakapan**:
   - AI menanyakan format laporan yang diinginkan (*Excel RAB Lengkap*, *PDF Rekapitulasi Eksekutif*, *Progress Kurva S*).
3. **Pratinjau & Gerbang Konfirmasi**:
   - AI menampilkan kartu **Pratinjau Pembuatan Laporan** dan rincian lembar kerja.
   - Tombol **Konfirmasi** dan **Batalkan** muncul.
   - Pengguna mengklik **Konfirmasi** -> Dokumen diproses dan tautan unduh/laporan disajikan.

---

### Skenario 7: Periksa Deviasi Kurva S (`PERIKSA_KURVA_S`)
1. **Aksi**: Klik tombol **Periksa Kurva S**.
2. **Ekspektasi Percakapan**:
   - AI menganalisis progres rencana vs realisasi aktual.
   - Muncul badge deviasi (misal: `-3.3%`), tabel mingguan evaluasi, dan rekomendasi mitigasi percepatan jalur kritis.

---

### Skenario 8: Penjelasan Rinci Item RAB (`JELASKAN_ITEM`)
1. **Aksi**: Klik tombol **Jelaskan Item**.
2. **Ekspektasi Percakapan**:
   - Pengguna memilih item dari daftar atau mengetik *"Pondasi Batu Kali"*.
3. **Hasil**: AI menyajikan rincian rumus volume geometris dan tabel komposisi koefisien SNI (Batu Belah, Semen, Pasir Pasang, Tukang Batu, dsb).

---

### Skenario 9: Rekalkulasi RAB Deterministic (`RECALCULATE`) — *Mutating Action*
1. **Aksi**: Klik tombol **Recalculate**.
2. **Ekspektasi Percakapan**:
   - AI menanyakan cakupan rekalkulasi (*Update Seluruh Standar AHSP PUPR 2026*, *Hitung Ulang Pajak & Overhead*).
3. **Gerbang Konfirmasi & Diff Preview**:
   - AI menampilkan **Tabel Perbedaan (Diff Table)** nilai lama vs nilai baru sebelum diterapkan.
   - Nilai tidak berubah pada spreadsheet sebelum pengguna mengklik tombol **Konfirmasi**.
   - Setelah dikonfirmasi, status berganti menjadi `Aksi Berhasil Diterapkan` dan toast notifikasi muncul.

---

### Skenario 10: Bantuan Panduan Fitur (`BANTUAN_FITUR`)
1. **Aksi**: Klik tombol **Bantuan Fitur**.
2. **Ekspektasi Percakapan**:
   - AI menampilkan pilihan modul yang ingin dipelajari (*Cara Import Excel*, *Cara Ekspor PDF*, *Wizard RAB Otomatis*).
   - AI memberikan instruksi terstruktur 4 langkah bernomor yang jelas dan mudah dipahami.

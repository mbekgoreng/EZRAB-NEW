# Quick Actions Known Limitations & Safe Fallbacks

## 1. Batasan yang Diketahui (Known Limitations)

1. **Format Input Dimensi Bebas pada Kasus Sangat Kompleks**
   - *Batasan*: Parser ekspresi teks alami mendukung pola umum seperti `"P: 6m, L: 0.2m, T: 0.3m, Jumlah: 4"` dan variasi bahasa Indonesia sehari-hari. Bentuk geometri tidak beraturan (misal: trapesium bertingkat atau kurva lengkung kubah) memerlukan input form terstruktur atau rumus QTO khusus.
   - *Mitigasi*: Ketika dimensi ambigu atau tidak lengkap terdeteksi, AI CoAssistant secara adaptif meminta klarifikasi dan menyediakan formulir parameter interaktif (*adaptive parameter schema*).

2. **Ekstraksi Vision AI DED pada Resolusi Gambar Sangat Rendah**
   - *Batasan*: Dokumen gambar kerja yang diunggah dengan resolusi di bawah 72 DPI atau teks berbayang dapat menghasilkan skor confidence ekstraksi di bawah $0.75$.
   - *Mitigasi*: Seluruh data berstatus `REQUIRES_REVIEW` dan mewajibkan verifikasi manual oleh estimator sebelum ditransformasikan menjadi item QTO resmi.

3. **Ketergantungan Kuota / Hak Akses Multi-Tenant**
   - *Batasan*: Operasi ekspor massal atau mutasi database membutuhkan izin role minimal `ESTIMATOR` atau `SUPER_ADMIN`.
   - *Mitigasi*: Role `VIEWER` atau `CLIENT` dibatasi pada operasi baca-saja (*Read-Only*) dengan pesan penolakan yang ramah dan aman tanpa membocorkan struktur internal.

---

## 2. Mekanisme Fallback & Ketahanan Sistem

1. **Seamless Client Offline Fallback**
   - Ketika koneksi ke backend API terputus atau backend dalam mode maintenance, `defaultAiProvider` di frontend secara otomatis mengambil alih giliran dialog menggunakan mock state machine lokal tanpa memutus interaksi pengguna.
2. **Deterministic Calculation Guard**
   - Tidak ada angka final yang dikarang oleh model LLM. Seluruh kalkulasi volume, harga satuan, dan grand total wajib melalui `CalculationService` dan `SafeDecimalEngine`.
3. **Fail-Closed Confirmation Gate**
   - Operasi yang mengubah data proyek (`RECALCULATE`, `BUAT_LAPORAN`) tidak akan pernah mengeksekusi mutasi jika sesi dibatalkan, kedaluwarsa, atau tidak dikonfirmasi secara eksplisit oleh pengguna.

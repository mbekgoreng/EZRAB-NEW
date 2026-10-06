# EZRAB — ALUR PENGALAMAN PENGGUNA (UX FLOW & UI COMPONENTS)
**Dokumen:** `docs/interactive-rab-wizard/06-ux-flow.md`  
**Modul:** Interactive Automatic RAB Wizard  
**Tanggal:** 2026-09-15  

---

## 1. KOMPONEN UI COASSISTANT WIZARD

1. **Card Grid Selector (`SelectableCategoryCards`):**
   - Menampilkan card pilihan dengan icon, judul, deskripsi, dan badge ("Populer", "SNI PUPR").
   - Efek hover interaktif, ringkasan fitur tiap template.

2. **Quick-Reply Buttons (`QuickReplyPills`):**
   - Tombol pilihan instan untuk jawaban tunggal (misal: "1 Lantai", "2 Lantai", "Baja Ringan").

3. **Dynamic Parameter Stepper (`WizardParameterForm`):**
   - Input angka dengan satuan otomatis (m, m², m³, unit).
   - Validasi langsung di sisi client sebelum dikirim ke backend.

4. **Review & Summary Card (`RabPreviewCard`):**
   - Menampilkan ringkasan parameter yang diinput, breakdown pekerjaan (Pondasi, Struktur, Arsitektur, MEP), subtotal estimasi, PPN 11%, dan Grand Total.
   - Tombol aksi:
     - `[← Ubah Parameter]`
     - `[Kalkulasi Ulang]`
     - `[✓ Terapkan ke Spreadsheet RAB]`
     - `[Batalkan]`

5. **Progress Stepper Bar:**
   - Menampilkan nomor tahapan aktif (Contoh: "Langkah 3 dari 5: Spesifikasi Struktur").

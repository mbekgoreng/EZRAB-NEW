# PHASE 4 — TEST PLAN

## 1. Lingkup Pengujian

Pengujian Phase 4 memverifikasi integrasi 3D Parametric Wireframe Viewer, akurasi adapter geometri untuk `HOUSE-T36-1FL`, keunikan ID stabil, determinisme output, boundary safety, layer visibility, dan sifat read-only terhadap data RAB.

---

## 2. Matriks Rencana Pengujian

| ID Test | Kategori | Deskripsi Pengujian | Hasil yang Diharapkan |
|---|---|---|---|
| `T4-01` | Adapter | Validasi pembentukan 3D model Rumah Tipe 36 (`HOUSE-T36-1FL`) | Menghasilkan $\ge 20$ elemen dengan bounding box valid |
| `T4-02` | Stable ID | Keunikan dan prediktabilitas `stableId` pada seluruh elemen 3D | 100% ID unik, tidak ada duplikasi, format konsisten |
| `T4-03` | Determinism | Eksekusi berulang dengan parameter sama menghasilkan output identik | Jumlah elemen, posisi $(x,y,z)$, dan dimensi sama persis |
| `T4-04` | Boundary Safety | Penolakan nilai `NaN`, `Infinity`, dan dimensi negatif | Validator mengembalikan `valid: false` jika ada anomali |
| `T4-05` | BIM Layers | Kategorisasi elemen ke dalam layer yang benar (Pondasi, Struktur, Dinding, Atap) | Layer counts terdistribusi akurat sesuai spesifikasi |
| `T4-06` | Space Packing | Algoritma penataan denah ruangan dalam batas kavling | 6 ruangan tertata dalam batas $W \times L$ tanpa tumpang tindih |
| `T4-07` | Resolver | Resolusi template via ID dan Kode | Menemukan template dan menghasilkan model 3D |
| `T4-08` | Error Handling | Penanganan ID template yang tidak ditemukan | Menghasilkan structured error yang jelas |
| `T4-09` | Immutability | Sifat read-only viewer terhadap data proyek dan RAB | Tidak ada mutasi pada ProjectContext / basis data RAB |
| `T4-10` | Regresi Suite | Pengujian regresi terhadap Phase 1, Phase 2, dan Phase 3 | Seluruh test suite backend & frontend tetap 100% lulus |
| `T4-11` | Production Build | Kompilasi TypeScript dan Vite build | 0 error kompilasi dan bundling berhasil |

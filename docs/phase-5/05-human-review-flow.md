# PHASE 5 — VISION AI DED EXTRACTION: HUMAN REVIEW WORKFLOW
**Date:** 14 September 2026  
**Status:** **APPROVED REVIEW DESIGN**  

---

## 1. Human-In-The-Loop Review Architecture

Vision AI bertindak sebagai asisten pembaca visual cerdas, sedangkan Estimator/Engineer memegang kendali otoritas penuh (**Backend & Estimator Authoritative**).

```
[ Upload PDF DED ]
        |
        v
[ Pipeline Extraction: Status = NEEDS_REVIEW ]
        |
        v
[ Side-by-Side Review UI Modal ]
  ├── Kiri: Canvas Gambar DED Asli (dengan Highlight Bounding Box)
  └── Kanan: Parameter Ekstraksi (Confidence, Evidence, Edit Input)
        |
        +---> [ User mengedit parameter yang ambigu / keliru ]
        |
        +---> [ User menyelesaikan kartu konflik jika ada ]
        |
        v
[ Tombol 'Approve & Generate RAB' ]
        |
        v
[ Status: APPROVED ] ---> [ Parametric Volume Engine (Phase 3) ]
                     ---> [ 3D Viewer Update (Phase 4) ]
                     ---> [ RAB Draft Generation ]
```

---

## 2. Fitur Utama Review Modal

1. **Synchronized Bounding Box Highlighting:**
   - Ketika pengguna mengklik parameter (misal: "Lebar Bangunan: 6.00m"), canvas PDF di sebelah kiri otomatis zoom dan menyoroti teks/dimensi sumber pada halaman terkait.
2. **Confidence Badges:**
   - Hijau (`>= 0.85`): High confidence.
   - Kuning (`0.60 - 0.84`): Medium confidence.
   - Merah (`< 0.60`): Low confidence / Unreadable.
3. **Conflict Resolution Cards:**
   - Menampilkan perbandingan eksplisit: "Denah Halaman 1 ($6.0\text{m}$) vs Potongan Halaman 3 ($6.5\text{m}$)" dengan tombol *Pilih Halaman 1*, *Pilih Halaman 3*, atau *Input Manual*.
4. **Parameter Locking:**
   - Parameter yang telah di-approve dikunci dengan tanda tangan `reviewedBy` dan `reviewedAt` untuk menjaga integritas audit trail.

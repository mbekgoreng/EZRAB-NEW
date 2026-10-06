# EZRAB CoAssistant Priority 3 — Vision AI Design & Conflict Detection

## 1. Alur Pipeline Vision AI DED
1. **Upload Dokumen DED**: Menerima file blueprint PDF / scan CAD.
2. **Render Halaman & OCR**: Segmentasi visual per halaman.
3. **Ekstraksi Elemen Struktur & Arsitektur**: Grid, dimensi as-as ($L \times W$), kolom (K1, K2), balok, pelat lantai, tebal dinding, elevasi.
4. **Confidence Scoring**: Setiap elemen memiliki confidence score (0.00 – 1.00). Nilai di bawah 0.75 otomatis ditandai `NEEDS_REVIEW` dengan `requiresReview = true`.
5. **Conflict Detection Engine**:
   - Membandingkan konsistensi dimensi lintas halaman dan potongan.
   - Contoh: Ketidaksesuaian tebal dinding 15 cm pada Denah Arsitektur vs 12 cm pada Potongan Struktur dideteksi dan disajikan kepada pengguna tanpa memilih sepihak.
6. **Human Review & Approval**: Pengguna memilih nilai yang benar sebelum disalurkan ke engine QTO.

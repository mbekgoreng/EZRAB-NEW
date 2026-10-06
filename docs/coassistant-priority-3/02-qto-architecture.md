# EZRAB CoAssistant Priority 3 — Deterministic QTO Architecture

## 1. Prinsip Integritas QTO
- **Sumber Data Terverifikasi**: Volume pekerjaan QTO hanya dihitung dari elemen DED yang berstatus `APPROVED`. Elemen yang masih `NEEDS_REVIEW` atau `REJECTED` diblokir dari kalkulasi.
- **Formula Terbuka & Tertelusur**: Setiap baris QTO menyertakan rumus geometri eksplisit (misal: $2 \times (P + L)$ untuk bowplank, $P \times L \times T$ untuk galian tanah dan beton kolom).
- **Metadata Lengkap**: Menyertakan kode item, uraian pekerjaan, volume, satuan, referensi dokumen sumber (ID berkas, nomor halaman, ID elemen), asumsi teknis, confidence, dan status review.

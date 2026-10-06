# PHASE 4 — KNOWN LIMITATIONS

## 1. Keterbatasan Tahap Saat Ini (Stage 1)

1. **Cakupan Template Saat Ini:** Adapter saat ini secara mendalam memetakan denah parametrik bangunan standar perumahan (`HOUSE-T36-1FL`), dan siap diperluas secara berurutan ke `HOUSE-T45-1FL`, `HOUSE-T70-1FL`, `HOUSE-T36-2FL`, `RUKO-2FL`, `INFRA-ROAD-CONCRETE`, dan `DRAIN-UDITCH`.
2. **Representasi Dinding Khusus:** Dinding saat ini direpresentasikan sebagai segmen prismatik ortogonal. Dinding lengkung non-ortogonal memerlukan input koordinat spline pada tahap CAD lanjutan.
3. **Resolusi Tekstur Material:** Mode solid menggunakan material shading warna material standar konstruksi (PBR tone). Tekstur fotorealistik resolusi tinggi (hi-res bump mapping) belum diaktifkan untuk menjaga waktu loading cepat (< 100ms).

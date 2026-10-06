# EZRAB CoAssistant Priority 4 — Human-In-The-Loop Approval Workflow

## 1. Operasi Wajib Persetujuan Manusia
Persetujuan eksplisit wajib diminta sebelum:
- Menyimpan/mengubah draf RAB ke database proyek.
- Menghapus item pekerjaan atau proyek.
- Mengubah harga satuan material/upah atau koefisien volume.
- Menerapkan hasil pembacaan Vision AI DED.
- Menghasilkan dokumen resmi / ekspor dengan konsekuensi bisnis.

## 2. Struktur Token Persetujuan
- `approvalId`: Identifier unik sesi persetujuan.
- `userId` & `workspaceId`: Identitas pemohon dan batas tenant.
- `preview`: Ringkasan sebelum/setelah tindakan.
- `expiresAt`: Batas waktu kedaluwarsa token (default 15 menit).
- `status`: `PENDING`, `APPROVED`, `REJECTED`, `EXPIRED`.
- **Kebijakan Fail-Closed**: Token yang telah melewati `expiresAt` ditolak secara otomatis dan tidak dapat dieksekusi.

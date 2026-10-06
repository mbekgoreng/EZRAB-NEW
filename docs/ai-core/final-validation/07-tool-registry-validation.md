# EZRAB AI CORE — Tool Registry & Function Calling Validation (Fase 7)

> **Status:** VERIFIED  
> **Tanggal:** 14 September 2026  
> **Auditor:** Senior QA Automation Engineer, Principal Architect

---

## 1. Inventarisasi & Klasifikasi 97 Tools Backend

| No | Modul | Jumlah Tool | Kategori Risiko | Permission Wajib | Memerlukan Konfirmasi? |
|---|---|---|---|---|---|
| 1 | **PROJECT** | 8 | `READ_ONLY` / `DESTRUCTIVE` | `AI_VIEW` / `AI_CREATE` / `AI_DELETE` | Ya (untuk create, update, delete) |
| 2 | **RAB** | 13 | `READ_ONLY` / `WRITE` | `AI_VIEW` / `AI_CREATE` / `AI_UPDATE` | Ya (untuk add, update, delete item) |
| 3 | **WBS** | 6 | `READ_ONLY` / `WRITE` | `AI_VIEW` / `AI_CREATE` / `AI_UPDATE` | Ya (untuk mutasi node) |
| 4 | **QTO** | 8 | `READ_ONLY` / `WRITE` | `AI_VIEW` / `AI_CREATE` / `AI_ANALYZE` | Ya (untuk add QTO) |
| 5 | **AHSP** | 10 | `READ_ONLY` | `AI_VIEW` / `AI_ANALYZE` | Tidak (pencarian & kalkulasi referensi) |
| 6 | **PRICE** | 8 | `READ_ONLY` / `WRITE` | `AI_VIEW` / `AI_UPDATE` | Ya (untuk update harga) |
| 7 | **DED** | 8 | `READ_ONLY` / `AI_INTERNAL` | `AI_VIEW` / `AI_ANALYZE` | Tidak |
| 8 | **KURVA_S** | 10 | `READ_ONLY` / `WRITE` | `AI_VIEW` / `AI_UPDATE` | Ya (untuk update progres) |
| 9 | **REPORT** | 8 | `READ_ONLY` / `EXPORT` | `AI_VIEW` / `AI_CREATE` | Ya (untuk create draft report) |
| 10 | **TEAM** | 8 | `ADMIN_ONLY` | `AI_DELETE` / `AI_UPDATE` | Ya (untuk undang/hapus anggota) |
| 11 | **ACCOUNT** | 8 | `BILLING_RELATED` | `AI_VIEW` / `AI_UPDATE` | Ya (untuk order pembayaran) |
| **TOTAL** | **11 Modul** | **97 Tools** | — | — | — |

---

## 2. Validasi Alur Eksekusi Dua Tahap (Two-Stage Execution)

1. **Tahap 1 (Proposal):**
   - Tool dengan `requiresConfirmation: true` (seperti `add_rab_item` atau `delete_rab_item`) tidak langsung mengubah database.
   - Sistem menghasilkan objek `ActionProposal` lengkap dengan parameter dan `riskLevel`.
2. **Tahap 2 (Eksekusi Terotorisasi):**
   - Perubahan hanya dieksekusi setelah pengguna mengonfirmasi via endpoint `POST /api/ai/actions/confirm`.
   - Backend memverifikasi ulang izin pengguna sebelum menerapkan perubahan dan mencatat jejak ke `audit_logs`.

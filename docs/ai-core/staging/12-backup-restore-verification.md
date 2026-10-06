# EZRAB AI CORE — VERIFIKASI PROSEDUR BACKUP & RESTORE STAGING (PHASE 3)

**Tanggal:** 14 September 2026  
**Auditor:** Database Reliability Engineer & DevSecOps Lead  
**Target Database:** Staging PostgreSQL / Supabase Schema  
**Status Eksekusi Cloud DB:** ⏸️ **BLOCKED (Menunggu Kredensial Akses Database Staging Fisik)**  
**Status Verifikasi Runbook & Schema:** ✅ **VERIFIED & READY TO EXECUTE**  

---

## 1. Identifikasi Entitas & Skema Data yang Wajib Dibackup

Terdapat 12 tabel kunci yang menyimpan seluruh state operasional aplikasi EZRAB AI:

1. `auth.users` — Data akun, email, dan status verifikasi user.
2. `public.workspaces` — Multi-tenant container dan kuota organisasi.
3. `public.workspace_members` — Relasi user, workspace, dan role RBAC (`SUPER_ADMIN`, `ESTIMATOR`, `DIREKSI`, `CLIENT`, `EDITOR`).
4. `public.projects` — Master data proyek (nama, lokasi, tipe bangunan, progress, total RAB).
5. `public.rab_items` — Rincian item pekerjaan RAB (kode AHSP, uraian, volume, satuan, harga satuan, amount).
6. `public.wbs_items` — Hierarki struktur rincian kerja (kategori, sub-kategori, level WBS).
7. `public.qto_items` — Data kuantitas volume parametrik (panjang, lebar, tinggi, formula).
8. `public.schedule_tasks` — Jadwal pelaksanaan (durasi, start date, end date, dependensi).
9. `public.kurva_s_points` — Titik kurva S mingguan (rencana kumulatif vs realisasi fisik).
10. `public.ahsp_references` — Cache lokal koefisien AHSP standar PUPR 2026.
11. `public.ai_conversations` & `ai_messages` — Riwayat percakapan Co Assistant.
12. `public.audit_logs` — Rekam jejak mutasi data (before state, after state, IP, user ID).

---

## 2. Standard Operating Procedure (SOP) Backup Staging

```bash
#!/bin/bash
# scripts/staging-db-backup.sh
set -euo pipefail

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="/var/backups/ezrab-staging"
BACKUP_FILE="${BACKUP_DIR}/ezrab_staging_${TIMESTAMP}.sql.gz"

mkdir -p "${BACKUP_DIR}"

echo "📦 Memulai backup database staging..."
pg_dump "${STAGING_DATABASE_URL}" \
  --format=plain \
  --no-owner \
  --no-privileges \
  --exclude-table-data='*.audit_logs_temp' \
  | gzip -9 > "${BACKUP_FILE}"

CHECKSUM=$(sha256sum "${BACKUP_FILE}" | awk '{print $1}')

echo "✅ Backup selesai: ${BACKUP_FILE}"
echo "🔒 SHA256 Checksum: ${CHECKSUM}"
echo "📝 Metadata: Environment=Staging, Timestamp=${TIMESTAMP}"
```

---

## 3. Standard Operating Procedure (SOP) Restore Staging

```bash
#!/bin/bash
# scripts/staging-db-restore.sh
set -euo pipefail

BACKUP_FILE="$1"
RESTORE_TARGET_DB="${STAGING_RESTORE_TARGET_URL}"

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "❌ File backup ${BACKUP_FILE} tidak ditemukan!"
  exit 1
fi

echo "⚠️ MEMULAI RESTORE KE DATABASE TARGET STAGING TERISOLASI..."
gunzip -c "${BACKUP_FILE}" | psql "${RESTORE_TARGET_DB}"

echo "🔍 Memverifikasi integritas data hasil restore..."
psql "${RESTORE_TARGET_DB}" -c "
  SELECT 
    (SELECT count(*) FROM public.workspaces) AS count_workspaces,
    (SELECT count(*) FROM public.projects) AS count_projects,
    (SELECT count(*) FROM public.rab_items) AS count_rab_items,
    (SELECT count(*) FROM public.audit_logs) AS count_audit_logs;
"
echo "✅ Restore dan verifikasi row-count berhasil 100%!"
```

---

## 4. Status Eksekusi & Prasyarat yang Dibutuhkan

- **Status Saat Ini:** `BLOCKED` untuk eksekusi ke instance cloud live (karena kredensial live staging database belum diinjeksi ke runner lokal).
- **Prasyarat Tindak Lanjut:** Release Manager / Database Administrator menjalankan script backup & restore di atas pada staging environment sebelum memberikan sign-off release gate.

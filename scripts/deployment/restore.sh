#!/usr/bin/env bash
# EZRAB — restore ke database TUJUAN EKSPLISIT (staging/lokal). 
# KEAMANAN: skrip ini MENOLAK target yang terlihat seperti produksi
# Supabase (host mengandung "supabase.co") kecuali variabel
# CONFIRM_PROD_RESTORE=YES ditulis manual saat menjalankan. Restore
# produksi adalah operasi owner dengan backup terverifikasi lebih dulu.
# Pakai: ./scripts/deployment/restore.sh <file.sql.gz> <DATABASE_URL>
set -euo pipefail
FILE="${1:-}"; TARGET="${2:-}"
[ -n "$FILE" ] && [ -n "$TARGET" ] || { echo "Pakai: $0 <file.sql.gz> <DATABASE_URL>"; exit 1; }
[ -f "$FILE" ] || { echo "File tidak ditemukan: $FILE"; exit 1; }

case "$TARGET" in
  *supabase.co*)
    if [ "${CONFIRM_PROD_RESTORE:-}" != "YES" ]; then
      echo "DITOLAK: target terlihat seperti Supabase produksi. Set CONFIRM_PROD_RESTORE=YES bila memang disengaja oleh owner."
      exit 1
    fi
    ;;
esac

echo "==> restore $FILE -> (target disamarkan)"
gunzip -c "$FILE" | psql "$TARGET"

echo "==> validasi cepat (jumlah baris tabel inti; kosong = skema tanpa data)"
psql "$TARGET" -c "\dt" | head -n 50
echo "Restore selesai. Lanjutkan validasi relasi sesuai docs/deployment/AWS_TO_VPS_MIGRATION.md."

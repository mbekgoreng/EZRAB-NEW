#!/usr/bin/env bash
# EZRAB — backup.
# Database produksi EZRAB adalah Supabase cloud (Postgres terkelola):
# backup utama = pg_dump dari CONNECTION STRING Supabase yang disediakan
# owner di server (variabel SUPABASE_DB_URL di .env.docker, TIDAK di repo,
# TIDAK dicetak). Skrip ini juga membackup volume upload lokal dan file
# .env.docker terenkripsi (opsional, hanya bila gpg tersedia).
set -euo pipefail
cd "$(dirname "$0")/../.."
STAMP="$(date +%Y%m%d-%H%M%S)"
DEST="${BACKUP_DIR:-$HOME/ezrab-backups}/$STAMP"
mkdir -p "$DEST"

if [ -f .env.docker ]; then
  set -a; . ./.env.docker; set +a
fi

if [ -n "${SUPABASE_DB_URL:-}" ]; then
  echo "==> pg_dump Supabase -> $DEST/supabase.sql.gz"
  pg_dump "$SUPABASE_DB_URL" | gzip > "$DEST/supabase.sql.gz"
else
  echo "SKIP db: SUPABASE_DB_URL kosong (isi di .env.docker server untuk backup db)."
fi

if docker volume inspect ezrab-unified_ezrab_uploads >/dev/null 2>&1; then
  echo "==> volume upload -> $DEST/uploads.tar.gz"
  docker run --rm -v ezrab-unified_ezrab_uploads:/data -v "$DEST":/backup alpine \
    tar czf /backup/uploads.tar.gz -C /data .
fi

# DB lokal (profile localdb) — hanya untuk lingkungan uji.
if docker compose --profile localdb ps db >/dev/null 2>&1; then
  echo "==> pg_dump db lokal -> $DEST/localdb.sql.gz"
  docker compose exec -T db pg_dump -U ezrab ezrab_local | gzip > "$DEST/localdb.sql.gz" || true
fi

echo "Backup selesai di $DEST"
ls -lh "$DEST"

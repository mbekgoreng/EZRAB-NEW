#!/usr/bin/env bash
# EZRAB — deploy di server (EC2/VPS). Jalankan dari root repo di server
# sebagai user deploy (non-root, anggota grup docker).
# Prasyarat: .env.docker sudah diisi owner di server (tidak dari repo).
set -euo pipefail
cd "$(dirname "$0")/../.."

[ -f .env.docker ] || { echo "ERROR: .env.docker tidak ada di server. Salin deployment/.env.example dan isi di server."; exit 1; }

echo "==> git pull (fast-forward saja; gagal = berhenti, tidak memaksa)"
git pull --ff-only

echo "==> build & up"
docker compose -f docker-compose.yml -f docker-compose.production.yml \
  --env-file .env.docker up -d --build

echo "==> health check"
./scripts/deployment/health-check.sh

echo "==> selesai. Log: docker compose logs -f --tail=100"

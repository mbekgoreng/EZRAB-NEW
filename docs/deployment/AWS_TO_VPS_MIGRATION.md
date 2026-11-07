# EZRAB — Migrasi AWS → VPS (Prosedur Bulan Keenam)

Prinsip: EZRAB berjalan sebagai Docker Compose yang sama di AWS EC2 dan di
VPS. Migrasi ini adalah pemindahan host, bukan pembangunan ulang: image,
`docker-compose.yml`, `docker-compose.production.yml`, file Nginx, dan
`.env.docker` berpindah apa adanya. Database produksi adalah Supabase cloud
dan TIDAK ikut pindah dalam prosedur ini (ia tidak berada di EC2 sejak
awal); bila suatu hari Supabase juga dipindah, itu proyek terpisah dengan
prosedur di bagian 4 sebagai fondasi.

## 1. Prasyarat infrastruktur

- VPS aktif dengan akses root awal (untuk membuat user deploy).
- Domain ezrab.site dapat diubah record DNS-nya oleh owner (registrar/DNS
  host saat ini: Vercel DNS — lihat catatan di laporan migrasi; cutover
  membutuhkan akses mengubah A record).
- Backup AWS terakhir yang lolos verifikasi (bagian 4).
- Jendela cutover dengan trafik rendah; Vercel deployment lama tetap hidup
  sebagai cadangan selama masa transisi (jangan dihapus dulu).

## 2. Spesifikasi VPS yang dibutuhkan

- Minimal: 2 vCPU, 4 GB RAM, 40 GB SSD (setara kelas EC2 yang dipakai).
- Disarankan: 4 vCPU, 8 GB RAM bila trafik AI meningkat — runner API
  melakukan pekerjaan proxy + meter, dan build frontend sebaiknya tetap
  dilakukan di mesin lain/CI lalu image ditarik, karena `vite build`
  repo ini membutuhkan ±3 GB heap.
- Ubuntu LTS (versi yang sama dengan EC2 agar perilaku identik).
- Bandwidth: sesuaikan dengan trafik aktual; aset statis besar dilayani
  Nginx dengan cache header immutable.

## 3. Instalasi Docker dan Compose

```bash
sudo apt-get update && sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo useradd -m -s /bin/bash deploy 2>/dev/null || true
sudo usermod -aG docker deploy
```

Lalu clone repo sebagai user `deploy`, salin `.env.docker` dari saluran
aman (bagian 6), dan jalankan `./scripts/deployment/deploy.sh`.

## 4. Backup dan restore database

Database produksi = Supabase cloud (Postgres terkelola di luar EC2/VPS),
sehingga TIDAK ada dump/restore dalam cutover host biasa. Yang berpindah
hanyalah string koneksi di `.env.docker` server.

Bila kelak database ikut dipindah ke Postgres self-hosted:

1. Di host lama: `./scripts/deployment/backup.sh` (pg_dump dari
   SUPABASE_DB_URL yang diisi owner di server).
2. Siapkan Postgres 16 di VPS (container profile `localdb` pada compose
   hanya untuk uji; produksi self-hosted perlu instance khusus dengan
   volume + backup terjadwal).
3. Restore ke STAGING dulu dengan `scripts/deployment/restore.sh`
   (skrip menolak target produksi tanpa konfirmasi eksplisit).
4. Validasi: jumlah baris tabel inti (users/profiles, projects, rab_items,
   credit ledger, invitations), cek relasi proyek→RAB tidak yatim,
   bandingkan total RAB satu proyek contoh antara lama dan baru.
5. Jalankan migrasi SQL `supabase/migrations/` yang belum terapan secara
   berurutan, lalu uji login + buka proyek contoh sebelum cutover.

Ekstensi/RLS/fungsi mengikuti dump; verifikasi `pg_extension` dan
kebijakan RLS (`pg_policies`) sesudah restore.

## 5. Migrasi penyimpanan file

Aplikasi saat ini tidak menyimpan upload pengguna di disk server:
dokumen diolah di browser, persistence utama adalah localStorage +
Supabase. Volume `ezrab_uploads` pada compose adalah persiapan untuk
jalur backend persisten. Bila saat migrasi volume itu sudah berisi data:

```bash
# di EC2 lama
./scripts/deployment/backup.sh   # menghasilkan uploads.tar.gz
# pindahkan arsip lewat scp/rsync terenkripsi ke VPS, lalu:
docker run --rm -v ezrab-unified_ezrab_uploads:/data -v "$PWD":/backup alpine \
  sh -c "cd /data && tar xzf /backup/uploads.tar.gz"
```

## 6. Transfer variabel lingkungan

- Satu-satunya sumber: `.env.docker` di server lama (tidak ada di repo,
  tidak pernah dikirim lewat chat/log).
- Transfer dengan `scp` langsung antar-server atau lewat media terenkripsi
  owner; verifikasi daftar NAMA variabel cocok dengan
  `deployment/.env.example` (tanpa mencetak nilai).
- Setelah VPS live, putar (rotate) secret yang sensitif secara bertahap:
  EZRAB_ACCESS_SESSION_SECRET (menonaktifkan sesi lama), AI_GATEWAY_TOKEN,
  dan token provider — satu per satu dengan health check di antaranya.

## 7. Prosedur cutover DNS

1. 24 jam sebelumnya: turunkan TTL record A ezrab.site menjadi 300.
2. Deploy & verifikasi VPS pada subdomain uji (mis. `vps.ezrab.site`)
   dengan sertifikat sendiri; jalankan health check + uji alur kunci
   (login gate, Chat AI, ekspor) pada subdomain itu.
3. Arahkan A record `ezrab.site` dan `www` ke IP VPS. Tambahkan origin
   domain ke `CORS_ALLOWED_ORIGINS` TIDAK perlu diubah karena origin
   sama (domain sama, host berpindah).
4. Pantau log Nginx/API selama minimal 1 jam; pastikan
   `/api/ai/engine-status` menjawab dan gerbang akses menerima kode.
5. Setelah stabil, naikkan kembali TTL.

## 8. Konfigurasi SSL

Sama seperti di AWS: Nginx di host + certbot Let's Encrypt
(`certbot --nginx -d ezrab.site -d www.ezrab.site`), auto-renew via
systemd timer bawaan certbot. Paksa HTTPS (301) dan pastikan header
`X-Forwarded-Proto: https` diteruskan ke container web/API agar cookie
sesi ditandai `Secure` (accessGate membaca x-forwarded-proto).

## 9. Verifikasi kesehatan

Jalankan `./scripts/deployment/health-check.sh` lalu uji manual singkat:

- Landing termuat, `/app` mengarah ke gerbang tanpa sesi.
- Kode akses diterima, dashboard terbuka.
- `/api/ai/engine-status` memberi `status: ready` (bila kunci terisi).
- Chat AI menjawab satu pertanyaan dari data EZRAB.
- Satu ekspor Excel dan satu ekspor PDF dari proyek contoh berhasil.
- Restart `docker compose restart` → sesi & data tetap konsisten.

## 10. Prosedur rollback

1. Bila verifikasi gagal: kembalikan A record ke IP EC2 (TTL 300 membuat
   rollback selesai dalam hitungan menit).
2. EC2 JANGAN dimatikan sebelum masa pengamatan (minimal 7 hari) selesai.
3. Bila rollback terjadi setelah ada penulisan data baru di VPS: karena
   database adalah Supabase cloud yang sama, tidak ada divergensi data —
   kedua host selalu membaca/menulis database yang sama. Inilah alasan
   desain mempertahankan Supabase selama masa AWS.
4. Catat penyebab kegagalan, perbaiki di staging, ulangi dari bagian 7.

## 11. Checklist penutupan AWS

- [ ] Masa pengamatan VPS selesai tanpa insiden.
- [ ] Backup terakhir dari EC2 diarsipkan (termasuk uploads.tar.gz).
- [ ] Snapshot/volume EC2 dihapus setelah masa retensi owner.
- [ ] Instance EC2 di-terminate; Elastic IP dilepas.
- [ ] AWS Budgets/alert dinonaktifkan atau disesuaikan.
- [ ] Security group & key pair AWS dihapus dari inventaris.
- [ ] Deployment Vercel lama: putuskan terpisah (pertahankan sebagai
      cadangan statis atau hapus) — keputusan owner, bukan bagian cutover.
- [ ] Dokumen ini diperbarui dengan tanggal & hasil migrasi aktual.

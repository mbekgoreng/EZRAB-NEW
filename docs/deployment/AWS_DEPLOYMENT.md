# EZRAB — Panduan Deployment AWS (EC2 + Docker Compose)

Status: SIAP UNTUK AWS (belum di-deploy — pembuatan resource AWS, DNS, dan
biaya memerlukan otorisasi eksplisit owner). Arsitektur sengaja sederhana:
satu EC2, Docker Compose, Nginx, database tetap Supabase cloud. Tidak ada
Kubernetes/EKS/NAT Gateway — tidak ada kebutuhan terbukti untuk itu.

## 1. Pilihan region & instance (evaluasi)

- **Region:** `ap-southeast-1` (Singapura) — region yang sama dengan
  proyek Supabase EZRAB saat ini (meminimalkan latensi app↔database) dan
  terdekat ke pengguna Indonesia. Alternatif `ap-southeast-3` (Jakarta):
  periksa ketersediaan tipe instance & harga di konsol — BELUM
  TERverifikasi dari sesi ini; jangan mengandalkan ingatan harga.
- **Arsitektur CPU:** x86_64 dipilih sebagai default aman. Dependensi
  repo adalah JavaScript murni + aset; tidak ada modul native wajib yang
  teridentifikasi (exceljs/jspdf/three murni JS). ARM (Graviton) secara
  teknis sangat mungkin cocok, tetapi aturan migrasinya: gunakan ARM
  HANYA setelah `docker compose build` terverifikasi di instance ARM —
  sampai dibuktikan, x86 menghilangkan satu variabel risiko.
- **Kelas instance:** mulai 2 vCPU / 4 GB RAM / 40 GB gp3. CATATAN
  terukur dari repo ini: `vite build` membutuhkan heap ±3 GB dan build
  penuh ±2 menit — lakukan build di mesin pengembangan/CI lalu kirim
  image (atau build di instance pada jam sepi), jangan menjadikannya
  pekerjaan rutin instance kecil. Naikkan ke 8 GB bila log menunjukkan
  tekanan memori.
- **Biaya 6 bulan:** TIDAK dikutip angka pasti di dokumen ini — harga
  on-demand berubah per region/kelas dan tidak dapat diverifikasi live
  dari sesi ini. Owner memeriksa di AWS Pricing Calculator untuk:
  EC2 on-demand 6 bulan + EBS gp3 40 GB + transfer keluar wajar +
  (opsional) Elastic IP. Periksa juga kelayakan kredit AWS Activate/
  free-tier di konsol akun aktual; jangan berasumsi kredit tersedia.

## 2. Provisioning EC2 (Ubuntu LTS)

1. Luncurkan instance Ubuntu LTS (versi LTS terbaru yang tersedia),
   x86_64, key pair baru khusus deployment, root volume gp3 40 GB
   terenkripsi.
2. Tempelkan Elastic IP agar IP stabil untuk DNS.
3. Security group (prinsip hak paling kecil):
   - 22/tcp dari IP owner saja (atau lewat AWS Systems Manager Session
     Manager — lebih aman, tanpa port terbuka).
   - 80/tcp dan 443/tcp dari 0.0.0.0/0.
   - TIDAK ADA port database publik; TIDAK ADA port 3001/8080 publik
     (API & web container hanya di localhost/di belakang Nginx host).
4. Aktifkan AWS Budgets + billing alert (email owner) pada ambang bulanan
   yang dipilih owner, SEBELUM workload berjalan.

## 3. Hardening & user deployment

```bash
sudo adduser deploy && sudo usermod -aG sudo deploy   # sudo seperlunya
# SSH: key-only, nonaktifkan password & root login
sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sudo systemctl restart ssh
sudo apt-get update && sudo apt-get -y upgrade
sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable
```

Instal Docker Engine + Compose plugin (langkah sama seperti
AWS_TO_VPS_MIGRATION.md bagian 3), tambahkan `deploy` ke grup docker,
lalu semua operasi aplikasi dilakukan sebagai `deploy`.

## 4. Aplikasi

```bash
git clone <repo> ezrab && cd ezrab
cp deployment/.env.example .env.docker   # lalu ISI DI SERVER oleh owner
./scripts/deployment/deploy.sh
```

Isi `.env.docker` langsung di server (editor lokal server, bukan lewat
chat): kode akses + session secret (openssl rand -hex 32), PUBLIC_APP_URL
= https://ezrab.site, CORS_ALLOWED_ORIGINS menyertakan domain produksi,
kunci AI yang dipakai, APP_ENV=production. Nilai yang kosong = fitur
nonaktif jujur (fail-closed), jadi pengisian boleh bertahap.

## 5. Nginx host & TLS

Container `web` mendengarkan 127.0.0.1:8080. Nginx host meneruskan:

```nginx
server {
    listen 80;
    server_name ezrab.site www.ezrab.site;
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        client_max_body_size 5m;
    }
}
# blog.ezrab.site: server block kedua dengan server_name blog.ezrab.site
# dan proxy_pass yang sama — konfigurasi container membedakan host untuk
# konten /blog (lihat nginx/ezrab.conf).
```

TLS: `sudo apt-get install -y certbot python3-certbot-nginx` lalu
`sudo certbot --nginx -d ezrab.site -d www.ezrab.site` (dan blog bila
dipakai). Renewal otomatis via timer certbot; uji dengan
`sudo certbot renew --dry-run`.

## 6. Gerbang akses (dokumen /app)

Di Vercel, dokumen /app/* di-gate Edge Middleware. Di arsitektur ini
penegakannya berlapis dan setara secara fungsional:

1. Semua API sensitif ter-gate di runner (verifikasi cookie sesi HMAC
   yang sama, dari `api/_lib/accessGate.js`) — data tidak dapat diakses
   tanpa sesi meskipun dokumen termuat.
2. SPA memeriksa `/api/access/session` saat memuat dan menampilkan layar
   gerbang; ini perilaku aplikasi yang sudah ada.
3. Untuk penegakan dokumen setara middleware (redirect sebelum HTML
   terlayani), aktifkan `auth_request` Nginx host yang memvalidasi cookie
   lewat endpoint internal runner — dicatat sebagai peningkatan opsional
   yang harus diuji di staging sebelum diaktifkan, BUKAN bawaan awal,
   agar tidak mengunci owner dari halamannya sendiri.

## 7. Volume, backup, monitoring

- Volume persisten: `ezrab_uploads` (upload backend persisten) dikelola
  Compose; backup dengan `scripts/deployment/backup.sh` (menghasilkan
  dump Supabase via pg_dump bila SUPABASE_DB_URL diisi owner di server +
  arsip volume).
- Jadwalkan backup.sh via cron user deploy (mis. harian 03:30) dan salin
  hasilnya keluar instance (S3 dengan lifecycle, atau unduh berkala) —
  backup yang hanya ada di instance yang sama bukan backup.
- Log: rotasi bawaan Docker diatur di compose produksi (10 MB × 3).
- Monitoring: health check `scripts/deployment/health-check.sh` dari cron
  5-menit dengan alert sederhana (atau AWS CloudWatch alarm pada status
  check instance + alarm billing dari bagian 2).
- Restart policy `unless-stopped` memastikan layanan pulih setelah reboot.

## 8. Yang TIDAK dilakukan dokumen ini

Tidak membuat resource AWS, tidak mengubah DNS, tidak menyentuh
deployment Vercel yang ada, dan tidak memindahkan database. Semua langkah
di atas dijalankan owner (atau sesi berikutnya dengan otorisasi eksplisit)
saat jendela deployment dipilih.

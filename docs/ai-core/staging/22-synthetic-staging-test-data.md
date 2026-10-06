# EZRAB AI CORE — DATASET UJI SINTETIS NON-SENSITIF STAGING (PHASE 5)

**Tanggal:** 14 September 2026  
**Auditor:** Quality Assurance & Data Reliability Engineer  
**Prinsip Data:** 100% Data Sintetis/Dummy, Zero Confidential Data, Zero Production PII  

---

## 1. Master Entitas Workspace & Akun Uji Sintetis

### Workspace Multi-Tenant:
1. **Workspace Alpha (Tenant Utama):**
   - ID: `ws-tenant-alpha`
   - Nama Organisasi: `PT Konstruksi Nusantara Prima`
   - Paket: Pro Subscription (10 Seats, Unlimited Projects)
2. **Workspace Beta (Tenant Pembanding Isolasi):**
   - ID: `ws-tenant-beta`
   - Nama Organisasi: `CV Cipta Bangun Perkasa`
   - Paket: Basic Free Tier (2 Seats)

### User Personas & Role RBAC:
- **`estimator-alpha@ezrab.test`** (Role: `ESTIMATOR`, Workspace: `ws-tenant-alpha`) ➔ Hak akses: View, Chat, QTO, Mutasi RAB (wajib konfirmasi).
- **`direksi-alpha@ezrab.test`** (Role: `DIREKSI`, Workspace: `ws-tenant-alpha`) ➔ Hak akses: View Kurva S, Executive Summary, Read-Only Chat.
- **`client-alpha@ezrab.test`** (Role: `CLIENT`, Workspace: `ws-tenant-alpha`) ➔ Hak akses: View Client View RAB (tanpa internal markup).
- **`estimator-beta@ezrab.test`** (Role: `ESTIMATOR`, Workspace: `ws-tenant-beta`) ➔ Digunakan untuk pengujian penolakan cross-tenant.

---

## 2. Master Proyek Konstruksi Sintetis

### Proyek 1: Rumah Tinggal Sederhana Tipe 36/60
- **ID Proyek:** `PRJ-SYNTH-T36-01`
- **Lokasi:** Karawang, Jawa Barat
- **Tipe Bangunan:** Rumah Tinggal 1 Lantai
- **Luas Bangunan:** 36 m2 | Luas Tanah: 60 m2
- **Daftar Pekerjaan Utama:**
  1. *Pekerjaan Persiapan:* Pengukuran & Bouwplank (24 m' × Rp 125.400 = Rp 3.009.600)
  2. *Pekerjaan Tanah:* Galian Tanah Pondasi (18.5 m3 × Rp 86.200 = Rp 1.594.700)
  3. *Pekerjaan Pondasi:* Pasangan Batu Kali 1:5 (12.4 m3 × Rp 850.000 = Rp 10.540.000)
  4. *Pekerjaan Struktur:* Sloof & Kolom Praktis K-175 (4.8 m3 × Rp 3.850.000 = Rp 18.480.000)
  5. *Pekerjaan Dinding:* Pasangan Dinding Bata Ringan Hebel (115 m2 × Rp 142.000 = Rp 16.330.000)
  6. *Pekerjaan Atap:* Rangka Baja Ringan & Genteng Metal (48 m2 × Rp 245.000 = Rp 11.760.000)

### Proyek 2: Pekerjaan Jalan Lingkungan Rabat Beton K-250
- **ID Proyek:** `PRJ-SYNTH-JALAN-02`
- **Lokasi:** Cikarang, Jawa Barat
- **Dimensi:** Panjang 200 m, Lebar 3.5 m, Tebal 0.15 m (Volume Beton: 105 m3)
- **Item RAB:** Beton Ready Mix K-250, Plastik Cor, Bekisting Baja, Joint Sealant.

### Proyek 3: Saluran Drainase Precast U-Ditch
- **ID Proyek:** `PRJ-SYNTH-UDITCH-03`
- **Lokasi:** Tangerang, Banten
- **Dimensi:** U-Ditch 40x40x120 cm (Panjang Saluran: 120 m = 100 unit precast)
- **Item RAB:** Galian Tanah, Pasir Urug t=10cm, Pemasangan U-Ditch & Cover U-Ditch Heavy Duty.

---

## 3. Desain Seed Mechanism Non-Destruktif

Skrip seed staging dirancang menggunakan insert dengan klausa `ON CONFLICT DO NOTHING`:
```typescript
// scripts/staging/seed-staging-data.ts (Konsep Desain)
export async function seedStagingData(dbClient: any) {
  console.log('🌱 Seeding synthetic test projects into staging database...');
  // Menyisipkan ws-tenant-alpha dan ws-tenant-beta tanpa menimpa data yang ada
}
```
> [!CAUTION]
> Skrip seed ini hanya boleh dieksekusi pada staging database yang terisolasi dan diproteksi dengan pemeriksaan environment variable `NODE_ENV === 'staging'`.

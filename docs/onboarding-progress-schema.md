# Draft Skema Progres Onboarding per Pengguna

> **Status: DOKUMENTASI SAJA.** Jangan membuat migration, tabel database, atau
> backend sync pada fase ini. Skema ini disiapkan untuk saat autentikasi
> (`AUTH_ENABLED`) diaktifkan kembali. Tidak mengasumsikan provider database
> tertentu — sesuaikan dengan hasil audit schema saat itu.

## Konteks saat ini

- `AUTH_ENABLED = false` → tidak ada `user_id`; progres hanya di `localStorage` per-browser.
- Key aktif: `ezrab_onboarding_done_v1` (`'1'` = selesai), `ezrab_tour_seen_<featureId>` (`'1'`).
- Key legacy termigrasi: `ezrab_onboarding_completed` → `ezrab_onboarding_done_v1` (idempoten).

## Skema konseptual (saat auth aktif)

Tabel: `user_onboarding_progress`

| Kolom | Tipe | Keterangan |
|---|---|---|
| `user_id` | uuid, PK, FK → auth.users | Pemilik progres; RLS: hanya pemilik |
| `onboarding_version` | int, default 1 | Versi skema; naikkan jika struktur berubah |
| `welcome_completed_at` | timestamptz, nullable | Kapan welcome onboarding selesai |
| `dashboard_tour_completed_at` | timestamptz, nullable | Kapan dashboard tour selesai |
| `role_preference` | text, nullable | Estimator / Kontraktor / Konsultan / dll. (preferensi, bukan izin) |
| `tutorial_progress` | jsonb, default `{}` | `{ "<featureId>": { "seen": true, "completed_at": "..." } }` |
| `dismissed_tutorials` | text[], default `{}` | Daftar tutorial yang dilewati pengguna |
| `checklist_progress` | jsonb, default `{}` | `{ "<checklistId>": { "done": true, "completed_at": "..." } }` |
| `created_at` | timestamptz, default now() | |
| `updated_at` | timestamptz, default now() | |

## Aturan

1. **Satu baris per pengguna** (upsert berdasarkan `user_id`).
2. **RLS wajib**: `auth.uid() = user_id` untuk SELECT/INSERT/UPDATE. Jangan pernah percaya `user_id` dari client tanpa validasi session.
3. **Migrasi localStorage → server** (sekali, saat login pertama setelah auth aktif):
   - Jika `localStorage['ezrab_onboarding_done_v1'] === '1'` dan `welcome_completed_at` null → isi dengan waktu migrasi.
   - Jika server sudah punya data → server menang (jangan timpa dengan localStorage kosong).
4. **Versioning**: perubahan tutorial besar menaikkan `onboarding_version`; welcome modal TIDAK boleh muncul ulang hanya karena versi naik — hanya tampilkan pengumuman kontekstual yang bisa ditutup.
5. **Privasi**: jangan simpan isi dokumen DED, data RAB, atau harga proyek di kolom progres.
6. **Offline**: tulis ke localStorage dulu sebagai cache, sinkronkan saat online; konflik → server menang untuk status selesai, gabungkan (union) untuk `dismissed_tutorials`.

## Pemetaan localStorage → kolom

| localStorage | Kolom |
|---|---|
| `ezrab_onboarding_done_v1` | `welcome_completed_at` (ada/tidak) |
| `ezrab_tour_seen_<id>` | `tutorial_progress.<id>.seen` |
| `ezrab_onboarding_schema_version` | `onboarding_version` |

## Yang TIDAK dilakukan fase ini

- Membuat migration / tabel.
- Menulis kode sync / API.
- Mengubah `App.tsx` untuk membaca dari server.

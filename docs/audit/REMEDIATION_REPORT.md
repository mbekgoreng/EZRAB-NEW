# REMEDIATION REPORT — Master Remediation V2 (2026-10-20)

Branch: `integrasi/unified-ui-engine` · HEAD `dd81439` · **TIDAK ADA commit/push/deploy/migrasi/secret yang diubah.**

## Perubahan kode sesi ini (di luar Wave 1)

| # | File | Perubahan | Temuan |
|---|---|---|---|
| 1 | `src/data/priceDatabase2026/resolver.ts` | UNIT GATE: kandidat harga yang satuannya tidak cocok dengan satuan komponen AHSP → NOT_FOUND beralasan `UNIT_MISMATCH` (sebelumnya: record beda satuan dipakai diam-diam) | F-016 |
| 2 | `src/test/priceDatabase2026.test.ts` | TEST 15 baru: regresi unit gate (batu split kg; beton 2.2.1.4.5 < Rp 5 jt & PARTIAL) | F-016 |
| 3 | `src/components/settings/UnifiedSettingsView.tsx` | Kartu Audit AI jujur: init null, petakan `ready`, cabang gagal → tidak terhubung + pesan asli, hapus latensi rekaan 142 ms, badge tiga keadaan | F-006 (+F-005 sisi konsumen) |
| 4 | `api/ai/engine-status.js` | Hitungan provider diperbarui: + Dahl (≤80), Gemini-OAI (≤12), River (≤10); status `ready` memperhitungkan semuanya; label modes mutakhir. Tetap counts-saja, tanpa postur auth | F-005/F-010 |
| 5 | `src/services/coAssistantService.ts` | Fallback lokal: field `source: 'local-fallback'` + awalan pengungkapan "⚠️ Mode lokal…" pada teks jawaban | F-001 |
| 6 | `src/services/ai/orchestration/aiOrchestrator.ts` | Pengungkapan mode lokal yang sama pada cabang fallback orkestrator | F-001 |

Perubahan Wave 1 (terverifikasi ulang, tidak diubah lagi): `src/export/excelExportEngine.ts` (18 formula), `api/ai/tools/execute.js` (mapper sadar-mode), `api/_lib/aiGateway.js` (1 baris).

## Hasil tes — regression gate final (semua perubahan di tree)
| Suite | Sebelum (baseline laporan) | Sesudah | Exit |
|---|---|---|---|
| `tsc --noEmit --skipLibCheck` | 0 error | **0 error** | 0 |
| `vite build` | PASS | **PASS (1m 17s)** | 0 |
| `test:core` | 74/74 | **74/74** | 0 |
| `test:calculator` (golden) | PASS 100% | **PASS 100%** | 0 |
| `test:phase2-integrity` | ALL PASSED | **ALL PASSED** | 0 |
| `test:price` | 65 PASSED / 2 FAILED | **69 PASSED / 2 FAILED** | 1 (2 kegagalan baseline lama) |
| Gateway routing harness (mock fetch) | Cepat≡Mendalam (bug) | **7/7 PASS** | 0 |
| Excel recalc (LibreOffice, cache dibuang) | `<f>=` 61 sel | **0 `<f>=`; nilai cocok hitungan independen** | — |

2 kegagalan test:price yang tersisa = baseline lama, BUKAN regresi: TEST 3 (RAB-01: pembulatan resolver Rp 0,5 pada A.1.02.4a.1.d) & TEST 10 (AHSP-01: invariant usang — canonical memang memuat harga HSD by design). Bukti TEST 15 regresi asli: pada resolver pra-fix suite menjadi 66/5 dengan kegagalan persis angka F-016 (356412075); pada kode baru 69/2.
Catatan waktu: satu run test:price oleh jalur Batch 5 tertangkap di tengah jendela stash (66/5) — angka final yang sah adalah 69/2 sesudah fix menetap, dijalankan dua kali.

## Bukti dampak F-016 (scan seluruh katalog via resolver)
| Metrik | Pra-fix | Pasca-fix |
|---|---|---|
| 2.2.1.4.5 (beton f'c 20) | Rp 356.412.075 · FULL | **Rp 941.375 · PARTIAL** |
| Item per-m³ > Rp 20 jt | 21 | **0** |
| Item berubah harga | — | 523 (semua turun/lebih jujur; **0 naik**) |
| Item FULL → PARTIAL | — | 471 |

## Temuan yang TIDAK diperbaiki sesi ini (dengan alasan)
- **F-018 (2.2.1.4.1 coef 1.009):** ~~perbaikan yang benar = perbaiki parser generator AHSP + regenerasi + verifikasi SE DJBK~~ **SELESAI 2026-10-20 malam** — lihat addendum F-018 di bawah. (File canonical tetap tidak diedit manual; perbaikan lewat tahap errata generator sync + `ahsp:generate`.)
- **F-011 (seed demo tanpa label):** perlu flag `isDemo` pada Project + badge UI — perubahan produk; menunggu keputusan owner (aturan berdirinya: demo wajib berlabel DEMO).
- **F-012 (drift `updated_at`):** fix 1 baris di repository dev-shadow ATAU migrasi baru; status penerapan migrasi live = NEEDS_ACCESS sehingga tidak diubah buta.
- **F-009 (legacy header dev):** balik default mode authFoundation — menyentuh jalur dev backend; didokumentasikan sebagai prasyarat sebelum server/index.ts dideploy.
- **F-002/credits:** desain ledger ada (draft migrasi 2026-10-18); yang belum ada: fungsi RPC atomik reserve/commit/refund + sweeper kedaluwarsa + rekonsiliasi + pemakai server. Gate monetisasi tetap FAIL sampai dibangun & tarif dikalibrasi (CR-10: keputusan harga top-up owner masih pending).
- **F-007/F-021 (performa):** pengukuran selesai; optimasi (code-splitting canonical, kompresi aset public/, dedup gambar) = pekerjaan terpisah terukur.
- **F-013/F-014 (infra test):** perbaikan = tambah tsx/vitest ke devDependencies + tsconfig test — perubahan package.json/lockfile menunggu persetujuan owner.
- **SEC-03 (token gateway Vercel), rotasi secret, verifikasi DNS/RLS live:** NEEDS_ACCESS — aksi owner di dashboard.

## Keterbatasan eksplisit
- Kompatibilitas **Microsoft Excel** atas perbaikan EXP-01: NOT_TESTED (hanya LibreOffice di env ini). File baru sesuai spesifikasi OOXML & konvensi ExcelJS.
- Rantai AI live ke provider sungguhan tidak dipanggil dalam uji routing (fetch tiruan, kunci dummy) — yang dibuktikan adalah kontrak urutan provider/fallback gateway.
- Postur env production (token, kunci baru, penerapan migrasi Supabase) tidak dapat diverifikasi dari sandbox: NEEDS_ACCESS.

## ADDENDUM — Final Verification Gate (2026-10-20 malam)
### Hasil gate (semua dijalankan nyata di tree final)
| Uji | Perintah | Exit | Hasil |
|---|---|---|---|
| Typecheck | `tsc --noEmit --skipLibCheck` (NODE_OPTIONS 6144) | 0 | 0 error |
| Build | `vite build` (NODE_OPTIONS 8192) | 0 | PASS 1m 20s |
| Core | `npm run test:core` | 0 | 74/74 |
| Kalkulator golden | `npm run test:calculator` | 0 | PASS 100% |
| Phase-2 integrity | `npm run test:phase2-integrity` | 0 | ALL PASSED |
| Harga | `npm run test:price` | **1** | 69 PASSED / 2 FAILED — TEST 3 (RAB-01) & TEST 10 (AHSP-01), keduanya baseline lama; TEST 15 (F-016) PASS |
| Export honesty | `npx tsx src/test/exportHonesty.test.ts` | 0 | 5/5 |
| Routing gateway | harness mock-fetch (gate) | 0 | S1–S7 PASS (Cepat/Mendalam/500/abort/DED/Dokumen/tanpa-kunci 502) |
| Kontrak engine-status | harness handler langsung | 0 | 3/3 PASS (no_keys jujur; ready via River; tanpa bocor postur auth) |
| Scan F-016 | probe esbuild pra/pasca (stash) | 0 | 523 berubah (0 naik), FULL→PARTIAL 471 — identik run V2 |
**Tidak dijalankan / keterbatasan:** 28 file test vitest (runner tak terpasang — F-014); MS Excel (tidak ada di env); panggilan provider live (fetch tiruan by design); E2E browser penuh sesi ini (sweep Playwright audit 2026-10-20: 0 page error, tidak diulang).

### F-002 — Rencana implementasi ledger (monetisasi tetap BLOCKED)
Basis: draft `supabase/migrations/20261018_ai_credits_ledger.sql` (tabel sudah dirancang: tariffs, balances, ledger append-only + UNIQUE(user_id, idempotency_key), reservations, ai_usage_log). Yang harus dibangun sebelum monetisasi boleh dibahas:
1. **RPC atomik (belum ada):** `credit_reserve(user, amount, idempotency_key, ttl)` — kunci baris saldo (SELECT … FOR UPDATE), tolak bila saldo < amount, tulis reservasi + entri ledger PENDING dalam satu transaksi; `credit_commit(reservation_id, actual_amount)` — selisihkan aktual vs reservasi, kembalikan selisih; `credit_refund(reservation_id, reason)` — idempoten, hanya dari status RESERVED/COMMITTED-sebagian.
2. **Race & retry:** idempotency_key = UUID per panggilan AI dari klien, disimpan SEBELUM request; retry klien memakai key yang sama → RPC mengembalikan reservasi yang sudah ada (ON CONFLICT DO NOTHING + SELECT), tidak pernah double-charge. Timeout provider → reservasi dibiarkan hingga TTL, lalu sweeper.
3. **Sweeper kedaluwarsa:** job berkala membatalkan reservasi melewati TTL (status EXPIRED + entri refund ledger) — belum ada.
4. **Rekonsiliasi:** job harian membandingkan SUM(ledger) vs balances.balance_after terakhir per user; selisih → alert, bukan koreksi diam-diam.
5. **Jalur server wajib memakai RPC:** hanya gateway (`api/_lib/aiGateway.js` sesudah respons provider sukses → commit; gagal → refund) — tidak ada jalur klien yang boleh menulis ledger. Frontend `creditEngine.reserve()` (bug double-count CR-05) dipensiunkan saat server flow aktif.
6. **Tarif:** tetap DRAFT berkode `is_calibrated_draft=TRUE`; kalibrasi menunggu keputusan CR-10 owner (harga jual per 1.000 kredit vs biaya provider). TIDAK diasumsikan.
7. **Tes integrasi wajib:** dua reserve konkuren pada saldo pas-pasan (satu harus gagal), commit parsial, refund ganda (kedua = no-op), retry dengan key sama, sweeper pada reservasi kedaluwarsa.
Status: **BLOCKED** — desain siap, implementasi & tes belum ada; tidak ada migrasi yang dijalankan.

### Addendum F-018 — Perbaikan generator terverifikasi (2026-10-20 malam)
Dilaksanakan sebagai task terpisah berotorisasi. File berubah: `scripts/ahsp2026/syncCiptaKaryaMaster.py` (tahap SOURCE_ERRATA ber-sitasi + guard fail-safe + laporan JSON), `scripts/ahsp2026/testAhsp2026.ts` (Test 21), `data/ahsp2026/validated/ahsp_2026_master.json` + `ahsp_2026_components.json` (masing-masing 3 baris: 1 komponen), `data/ahsp2026/reports/sync_errata_applied.json` (baru), canonical + resources generated (regenerasi resmi `ahsp:generate`; resources hanya cap tanggal).
- Koefisien: 2.2.1.4.1 Batu split 2/3 **1.009 → 1009** (record canonical berubah: tepat **1**; audit semantik parsed per-item membuktikan tidak ada perubahan lain selain `lastUpdated`/cap tanggal).
- Tes: ahsp:test **21/21** exit 0 · ahsp-invariant **9/9** · tsc **0** · build **PASS** · test:core **74/74** · golden **100%** · phase2-integrity **ALL PASSED** · test:price **69/2** exit 1 (2 kegagalan SAMA PERSIS dengan baseline: TEST 3 RAB-01, TEST 10 AHSP-01 — bukan regresi).
- Baseline reproduktibilitas dibuktikan sebelum perbaikan: sync tanpa errata = diff nol; generate tanpa perubahan data = diff semantik hanya tanggal.
- Risiko terbuka: koefisien 1440 (2.2.1.5.11) tetap OPEN; kelas cacat yang sama di workbook Excel sumber hanya bisa tertutup tuntas bila workbook diperbaiki di sumbernya (file Windows, di luar repo) — errata generator menahan regresi setiap re-sync.

### Rekomendasi backup/dataset terlacak (±144 MB) — tanpa penghapusan
- `data/` (95 MB) & direktori audit/backup berisi dataset AHSP yang menjadi SUMBER generator canonical — menghapusnya menghilangkan kemampuan regenerasi terverifikasi (dibutuhkan untuk perbaikan F-018). **Opsi yang disarankan:** pertahankan di repo sampai regenerasi F-018 selesai, lalu pindahkan ke Git LFS atau arsip rilis (bukan hapus). Opsi lain: `.gitignore` hanya menahan file BARU (riwayat tetap besar) — tidak menyelesaikan bobot clone. Keputusan owner; tidak ada file disentuh di gate ini.

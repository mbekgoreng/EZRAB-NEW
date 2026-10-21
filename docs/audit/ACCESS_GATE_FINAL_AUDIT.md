# ACCESS GATE — FINAL PRE-COMMIT AUDIT (2026-10-21)

Branch `integrasi/unified-ui-engine` @ `dd81439d983e4238a9b58fb6f36b09272438e9ff`. Audit READ-ONLY + satu patch anti-lockout (di bawah). Tanpa commit/push/deploy/secret/migrasi.

## 1. Git preflight
- **Belum di-push (2 commit di atas remote c629b43):** `9d60013` fix(nav): dashboard routing audit + saturated stat cards + modal icons; `dd81439` fix(landing): pricing trust copy + shorter pricing section. Gabungan 9 file UI (dashboard views, WorkspaceView, SmartAddWorkItemModal, ExactPricing, AllProjectsView, 2 CSS) — TIDAK terkait gate, jangan dicampur ke commit gate.
- **Modified unstaged (16 file)** terpisah jelas per workstream:
  - *Access Gate:* `src/App.tsx` (bersama: wrapper PasscodeGate dari sesi lain + cabang /access sesi ini), `middleware.ts` & `api/_lib/accessGate.js` & `api/access/*` & `src/auth/*` & `src/test/passcodeGate.test.ts` (untracked/baru atau tulis-ulang).
  - *Remediation V2/Wave 1:* aiGateway.js, engine-status.js, tools/execute.js, UnifiedSettingsView.tsx, resolver.ts, excelExportEngine.ts, aiOrchestrator.ts, coAssistantService.ts, priceDatabase2026.test.ts.
  - *F-018:* syncCiptaKaryaMaster.py, testAhsp2026.ts, 2 validated JSON, 2 canonical generated (+ laporan errata untracked).
- **Untracked:** file gate baru, `docs/audit/*` + 3 laporan docs, `.audit-frag.json` (artefak audit lama — jangan ikut commit), `data/ahsp2026/reports/sync_errata_applied.json` (milik F-018).
- Tidak ada konflik; tidak ada perubahan yang ditimpa audit ini.

## 2. Audit implementasi (kode aktual dibaca ulang)
| Aspek | Hasil |
|---|---|
| Kode & secret hanya di server | **PASS** — grep: nilai kode & konstanta lama 0 hit di src/auth, middleware, api/access, accessGate; nama env 0 hit di seluruh chunk client dist; sourcemap dist = 0 file |
| Cookie | **PASS** — HttpOnly, Secure (HTTPS), SameSite=Lax, Path=/, Max-Age 43200 (teruji) |
| Token HMAC | **PASS** — format `v1.<exp>.<sig>`; verify timing-safe (Node timingSafeEqual; Edge loop konstan); expiry diperiksa; payload hanya expiry |
| Pemalsuan | **PASS (teruji)** — signature dirusak, secret lain, token kedaluwarsa → semua ditolak |
| Perbandingan kode | **PASS** — SHA-256 kedua sisi + timingSafeEqual (panjang tak bocor); kode tak pernah di-log (verify.js tanpa console.*), tak di-echo di respons |
| Redirect | **PASS** — `next` dibangun server dari path request; sisi client `sanitizeNextPath` hanya menerima /app (kasus `//evil`, `%2F%2Fevil`, URL absolut → fallback; teruji) |
| Env hilang | **PASS** — fail-closed: API 503 ACCESS_NOT_CONFIGURED, halaman → gerbang berstatus belum-terkonfigurasi, endpoint verify 503 tanpa cookie |
| Kegagalan API di SPA | **PASS** — semua non-OK/network diperlakukan terkunci (fail-closed) |
| Rate limit | **PARTIAL** — 10/10 mnt/IP via helper yang ada; penyimpanan per-instance serverless = best-effort (dinyatakan di kode & laporan). Store bersama = usulan terpisah (lihat §5) |
| Bypass | **PASS dengan 1 temuan diperbaiki** — lihat F-GATE-01. Jalur "lolos" middleware hanya: endpoint gerbang sendiri, engine-status, sesi valid. Mode `enabled=false` pada PasscodeGate adalah serah-terima terdesain ke real-login (AUTH_MODE), bukan bypass |
| Kompatibilitas Edge | **NOT_TESTED di Vercel nyata** — WebCrypto/HMAC teruji lintas-implementasi di Node (cookie Node diterima verifier Edge-twin & sebaliknya tidak berlaku karena middleware tak pernah menerbitkan token). Perilaku Vercel (matcher, env di middleware, urutan vs rewrite) hanya terbukti lewat deployment Preview yang diotorisasi |

### Temuan audit
- **F-GATE-01 (P2, DIPERBAIKI dalam audit ini):** fungsi middleware, bila dipanggil untuk `/api/access/*`, menjawab 401 — di production matcher mengecualikannya sehingga tidak berdampak, tetapi satu perubahan matcher di masa depan dapat mengunci total (endpoint penerbit sesi ikut digerbang). Patch minimal diterapkan: pengecualian eksplisit `/api/access/` di awal fungsi + tes regresi baru. Bukti: sapuan inventaris sebelum patch (401) vs suite sesudah (lolos).
- **F-GATE-02 (P2, GAP pra-ada):** jalur data Supabase langsung dari browser berada di luar gate (kontrolnya RLS; verifikasi live NEEDS_ACCESS). Bukan regresi gate; tercatat di matriks route.
- Tidak ada P0/P1 baru.

## 3. Hasil tes aktual
| Tes | Perintah | Exit | Hasil |
|---|---|---|---|
| Suite gate | `npx tsx src/test/passcodeGate.test.ts` | 0 | **16/16 PASS** (15 awal + anti-lockout; termasuk next protocol-relative) |
| Sapuan inventaris | harness tsx atas middleware (25 path × anon/sesi) | 0 | Semua keputusan sesuai matriks (sebelum patch: 2 anomali F-GATE-01; sesudah: bersih) |
| Typecheck | tsc --noEmit --skipLibCheck | 0 | 0 error |
| test:core | `npm run test:core` | 0 | 74/74 |
| Build (run sebelumnya, tree sama untuk file terbangun) | vite build | 0 | PASS; dist tanpa sourcemap |
| test:price | (tidak dijalankan ulang di audit ini — tak ada file bersama dengan gate) | 1 (tercatat) | 69/2 = baseline lama RAB-01 + AHSP-01 — TIDAK diubah statusnya |

**NOT_TESTED:** perilaku middleware di Vercel Preview/Production; rate limit lintas-instance; MS Excel (tidak terkait gate).

## 4. Deployment & konfigurasi
- Platform: Vercel (vercel.json: framework vite, buildCommand `npm run build:full`, outputDirectory dist, SPA rewrite mengecualikan /api/). Middleware root `middleware.ts` = konvensi Vercel (berjalan sebelum rewrite).
- Env server-only yang WAJIB disiapkan owner (nilai tidak dibaca/dicetak audit): `EZRAB_ACCESS_CODE`, `EZRAB_ACCESS_SESSION_SECRET` (≥16 karakter) — **di Production DAN Preview secara terpisah** (Preview tanpa env = gate fail-closed di Preview).
- Perubahan env di Vercel berlaku untuk deployment BERIKUTNYA → perlu redeploy sesudah env di-set.
- Gate TIDAK aktif di ezrab.site saat ini (kode belum ter-deploy; production masih berbasis promosi lama).

## 5. Penilaian risiko (§6)
- **Kode 4 digit:** 10.000 kombinasi; dengan rate limit efektif per-IP, tebakan manual tidak praktis; skrip terdistribusi antar-instance melemahkan batas → risiko brute-force sistematis tetap ADA. Ini penghalang demo, bukan autentikasi.
- **Sesi 12 jam:** wajar untuk demo; jendela penyalahgunaan cookie curian = sisa masa berlaku (token stateless tidak bisa dicabut per-sesi).
- **Rotasi secret:** mengganti `EZRAB_ACCESS_SESSION_SECRET` + redeploy mencabut SEMUA sesi seketika (fitur darurat yang baik); mengganti kode hanya memengaruhi penerbitan sesi baru.
- **Satu kode bersama:** semua pengunjung demo berbagi akses yang sama; tidak ada atribusi per orang & tidak ada otorisasi per-peran — jangan pernah diperlakukan sebagai AuthZ.
- **Usulan store bersama (belum dipasang, perlu persetujuan):** Upstash Redis/Vercel KV untuk rate limit global + denylist sesi; biaya lapis gratis umumnya cukup untuk skala demo; alternatif: tabel Supabase + RPC (pola sama seperti rancangan ledger F-002).

## 6. Status terpisah
- Implementasi lokal: **PASS** (dengan patch F-GATE-01).
- Kesiapan Preview: **PARTIAL** — siap diuji begitu env Preview di-set & deployment Preview dibuat (otorisasi terpisah); perilaku Vercel nyata masih NOT_TESTED.
- Kesiapan Production: **BLOCKED** — menunggu: env Production, persetujuan commit/push, promosi deployment oleh owner, dan keputusan menerima risiko kode 4 digit + rate limit best-effort sebagai penghalang sementara.

## Addendum — Rekonsiliasi & Preview Readiness (2026-10-21)
- Rekonsiliasi Git dihitung ulang dari nol dan COCOK dengan laporan ini: modified tepat 16 (Remediation 9 + F-018 6 + App.tsx 1), untracked 12 baris (gate baru 7 file termasuk), 2 commit belum push = 9 file tanpa tumpang-tindih. Inventaris unik lengkap + rencana pemisahan (termasuk rencana patch App.tsx yang TIDAK diterapkan dan tidak direkomendasikan untuk dipecah) ada di `PRECOMMIT_CHECKLIST.md` §1–3.
- Checklist konfigurasi Preview (env unik Preview, konfirmasi tanpa mencetak nilai, fail-closed, anti-promosi) dan checklist tes Preview (11 grup, semua NOT_RUN) ada di `PRECOMMIT_CHECKLIST.md` §4–5.
- F-GATE-02 diperhalus oleh inventaris RLS: migrasi lokal membuktikan desain deny-by-default untuk anon (69 policy, nol untuk anon/public); ketidakpastian tersisa murni soal penerapan live (NEEDS_ACCESS) — lihat matriks route §C.
- Rekomendasi: changeset Access Gate (8 file) layak dipertimbangkan untuk commit terpisah — mandiri, tanpa dependensi ke remediation/F-018, teruji lokal 16/16.

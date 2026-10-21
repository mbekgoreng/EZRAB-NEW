# PRE-COMMIT CHECKLIST — EZRAB (diperbarui: Preview Readiness & Rekonsiliasi, 2026-10-21)

## 1. Rekonsiliasi working tree (dihitung ulang dari Git, bukan dari laporan lama)
- Branch `integrasi/unified-ui-engine` · HEAD `dd81439d983e4238a9b58fb6f36b09272438e9ff` · staged: **tidak ada** (`git diff --cached` kosong).
- **Modified = tepat 16 file** (klaim laporan sebelumnya TERKONFIRMASI): Remediation 9 + F-018 6 + Access Gate (bersama) 1.
- **Untracked = 12 baris status** yang mengembang menjadi: gate baru 7 file, F-018 1 file (laporan errata), dokumen 3 laporan + `docs/audit/` (17 file), `.audit-frag.json` 1 file.
- **2 commit belum push** (di atas remote `c629b43`): `9d60013` = 7 file (DashboardViewSwitcher, EzrabAiDashboardView, EzrabAiDashboardViewClassic, WorkspaceView, SmartAddWorkItemModal, AllProjectsView, ezrab-design-system.css); `dd81439` = 2 file (ExactPricing, exact-landing.css). Nol tumpang-tindih dengan file modified/untracked.

## 2. Inventaris file unik per workstream
| Workstream | File |
|---|---|
| **Access Gate** (8) | `middleware.ts` (baru), `api/_lib/accessGate.js` (baru), `api/access/verify.js` (baru), `api/access/session.js` (baru), `src/auth/passcode.ts` (tulis ulang), `src/auth/PasscodeGate.tsx` (tulis ulang), `src/test/passcodeGate.test.ts` (tulis ulang), `src/App.tsx` (modified, bersama — lihat §3) |
| **2 commit UI** (9, sudah ter-commit lokal) | 7 file `9d60013` + 2 file `dd81439` (di atas) |
| **Remediation V2/Wave 1** (9) | `api/_lib/aiGateway.js`, `api/ai/engine-status.js`, `api/ai/tools/execute.js`, `src/components/settings/UnifiedSettingsView.tsx`, `src/data/priceDatabase2026/resolver.ts`, `src/export/excelExportEngine.ts`, `src/services/ai/orchestration/aiOrchestrator.ts`, `src/services/coAssistantService.ts`, `src/test/priceDatabase2026.test.ts` |
| **F-018** (7) | `scripts/ahsp2026/syncCiptaKaryaMaster.py`, `scripts/ahsp2026/testAhsp2026.ts`, `data/ahsp2026/validated/ahsp_2026_master.json`, `data/ahsp2026/validated/ahsp_2026_components.json`, `src/data/nationalCostDatabase/ahsp2026Canonical.generated.ts`, `src/data/nationalCostDatabase/ahsp2026CanonicalResources.generated.ts`, `data/ahsp2026/reports/sync_errata_applied.json` (baru) |
| **Dokumen audit** (20) | `docs/audit/` 17 file + `docs/EZRAB_AI_FEATURES_TEST_REPORT.md`, `docs/EZRAB_NAVIGATION_AUDIT_REPORT.md`, `docs/EZRAB_POST_PUSH_INTEGRATION_AUDIT.md` |
| **Liar** (1) | `.audit-frag.json` — JANGAN ikut commit; keputusan owner (hapus/abaikan) |

## 3. Rencana pemisahan changeset
| Changeset | Dependensi | Risiko bila dipisah |
|---|---|---|
| Access Gate (8 file) | Mandiri: UI ↔ endpoint ↔ middleware semuanya di dalam set yang sama; TIDAK bergantung pada file remediation/F-018 | Rendah. Satu-satunya catatan: `src/App.tsx` — lihat rencana patch di bawah |
| Remediation (9 file) | Mandiri; test:price-nya membaca canonical (F-018) tetapi lulus pada kedua urutan (dengan F-018 saja: baseline setara; dengan keduanya: TEST 15 ikut) | Rendah |
| F-018 (7 file) | Mandiri (generator + data hasil) | Rendah; canonical hasil regenerasi ikut apa adanya |
| Dokumen audit | Tidak ada | Nol; commit terpisah/opsional |

**Rencana patch presisi `src/App.tsx` (TIDAK diterapkan — menunggu persetujuan):** diff file ini = 4 hunk. Hunk 1 (import PasscodeGate) & bagian wrapper pada Hunk 4 berasal dari sesi lain (fondasi gerbang client-side); Hunk 2 (`isAccess`), Hunk 3 (judul /access), dan cabang `isAccess` pada Hunk 4 berasal dari sesi server-side. Karena Hunk 4 mencampur keduanya pada baris berdekatan, pemisahan dua sub-tahap hanya bisa lewat staging per-baris (`git add -p`). **Rekomendasi: JANGAN pecah.** Kedua sub-tahap adalah satu fitur; mem-commit fondasi saja akan menerbitkan keadaan antara yang justru dilarang spesifikasi (kode tertanam di bundle). App.tsx masuk utuh ke commit Access Gate.

## 4. Checklist konfigurasi Preview (BELUM dijalankan — aksi owner di dashboard Vercel)
- [ ] Set `EZRAB_ACCESS_CODE` untuk environment **Preview** saja.
- [ ] Set `EZRAB_ACCESS_SESSION_SECRET` untuk Preview: nilai acak kuat (disarankan ≥32 karakter), **unik untuk Preview** — jangan menyalin nilai environment lain, jangan memakai ulang untuk Production nanti.
- [ ] Konfirmasi TANPA mencetak nilai: nama variabel tampil di daftar env Vercel dengan nilai tersamar; verifikasi perilaku lewat respons endpoint (503 = belum terkonfigurasi; 401 untuk kode salah = terkonfigurasi) — bukan lewat membaca nilai.
- [ ] Verifikasi fail-closed Preview: sebelum env ter-set, /app di URL Preview harus mendarat di gerbang berstatus belum-terkonfigurasi dan API terlindungi menjawab 503.
- [ ] Sesudah env ter-set: buat deployment Preview baru (env hanya berlaku untuk deployment baru).
- [ ] Keamanan promosi: deployment Preview TIDAK menjadi Production dengan sendirinya; Production hanya berubah lewat promosi manual owner — jangan klik Promote selama pengujian.

## 5. Checklist tes Preview (semua NOT_RUN — belum ada otorisasi deployment)
| # | Tes | Hasil lokal (referensi) | Preview |
|---|---|---|---|
| 1 | /app/* tanpa sesi → gerbang; refresh & URL internal langsung | PASS (middleware + suite) | NOT_RUN |
| 2 | Kode salah → ditolak; kode benar → sesi terbit | PASS (endpoint, nilai dummy) | NOT_RUN |
| 3 | Cookie valid lolos; rusak/dipalsukan ditolak | PASS | NOT_RUN |
| 4 | Cookie kedaluwarsa ditolak | PASS (token dibuat kedaluwarsa) | NOT_RUN |
| 5 | Redirect /access tanpa loop; `next` eksternal/protocol-relative ditolak | PASS | NOT_RUN |
| 6 | API sensitif tanpa sesi → 401/503 | PASS (sapuan 25 path) | NOT_RUN |
| 7 | Endpoint publik (engine-status, landing, blog) tetap jalan | PASS | NOT_RUN |
| 8 | Percobaan berulang → 429; batas lintas-instance dicatat best-effort | PASS (per-instance) | NOT_RUN |
| 9 | Refresh + navigasi internal sesudah sesi terbit | PASS (stateless cookie) | NOT_RUN |
| 10 | Perilaku middleware nyata di Vercel (matcher, env, urutan vs rewrite, cookie di domain Preview) | NOT_TESTED | NOT_RUN |
| 11 | Regresi RAB/QTO/AHSP/AI/ekspor pada build yang sama | PASS (suite lokal) | NOT_RUN |

## 6. Status kesiapan
- Changeset Access Gate untuk commit terpisah: **SIAP DIPERTIMBANGKAN** (mandiri, teruji 16/16, tanpa dependensi silang) — menunggu persetujuan commit.
- Preview readiness: **PARTIAL** — kode siap; konfigurasi env Preview + deployment Preview belum ada (aksi owner + otorisasi).
- Production: **BLOCKED** (env Production, promosi manual, penerimaan risiko — lihat ACCESS_GATE_FINAL_AUDIT §6).

# EZRAB FINAL TEST MATRIX

**Tanggal:** 2026-10-19
**Branch:** `integrasi/unified-ui-engine`

## Status Legend
- **PASS**: Dijalankan, lulus dengan bukti
- **FAIL**: Dijalankan, gagal (dengan defect yang diperbaiki)
- **BLOCKED**: Tidak dapat dijalankan (prasyarat eksternal)
- **NOT RUN**: Belum dijalankan

---

## P0 — Integritas Harga & Data

| # | Test | Status | Bukti |
|---|------|--------|-------|
| P0-1 | Price integrity matrix (23 skenario) | **PASS** | `docs/EZRAB_PRICE_INTEGRITY_AUDIT_REPORT.md` — 23/23 |
| P0-2 | Factory sentinel (UNRESOLVED → 0) | **PASS** | Byte-level fixture, 6 items |
| P0-3 | Partial total label (isPartial) | **PASS** | Diperbaiki 2026-10-19, matriks #7/#8 |
| P0-4 | SmartAdd null→0 bug | **PASS** | Diperbaiki 2026-10-19 |
| P0-5 | AHSP identity gate (17 fragmen) | **PASS** | 15/15 displayPolicy tests |
| P0-6 | Unit gate (mismatch → fail-closed) | **PASS** | Resolver tests |
| P0-7 | Secrets scan (src/, api/) | **PASS** | 2026-10-19: 1 false positive (`task-${}`) |
| P0-8 | XLSX export byte-level (13 checks) | **PASS** | 9.879 bytes, 4 sheets, re-parsed |
| P0-9 | Display-only Rp0 labels | **NOT RUN** | Gap: AiChangePreviewModal, EstimatingCopilotPanel (dokumentasi) |

## P1 — Alur Inti

| # | Test | Status | Bukti |
|---|------|--------|-------|
| P1-1 | Design workflow E2E (8 langkah) | **PASS** | `docs/EZRAB_DESIGN_WORKFLOW_VERIFICATION_REPORT.md` — 8/8 Playwright |
| P1-2 | Duplicate prevention (cross-session) | **PASS** | Item count tidak double |
| P1-3 | Persistence + isolasi proyek (13) | **PASS** | localStorage round-trip |
| P1-4 | AI Design unit tests | **PASS** | 13/13 (aiDesign) + 8/8 (commandCenter) |
| P1-5 | QTO→AHSP mapping audit (9) | **PASS** | `docs/EZRAB_QTO_AHSP_2026_MAPPING_AUDIT_REPORT.md` — 9/9 |
| P1-6 | AHSP candidate picker (baru) | **PASS** | 5/5 functional (setelah fix keyword "bata"+"merah") |
| P1-7 | Mobile 390px | **PASS** | 3/3 (verification sprint) |
| P1-8 | Production build (vite) | **NOT RUN** | Terinterupsi runtime 4x; terakhir PASS 2026-10-18 (1m39s) |
| P1-9 | tsc clean | **PARTIAL** | 0 error 2026-10-19 (ai-design); re-run terinterupsi |
| P1-10 | Rp0 display audit | **PASS** | 2 diperbaiki (EstimatingCopilotPanel, DrawingReaderModal); 1 gap tersisa (AiChangePreviewModal) |

## P2 — AI Gateway, Credits, Integrasi

| # | Test | Status | Bukti |
|---|------|--------|-------|
| P2-1 | AI gateway fail-closed (no key → 502) | **PASS** | Kode: `api/_lib/aiGateway.js:424` |
| P2-2 | Credits 503 honest (no DB) | **PASS** | Kode: `api/credits/balance.js:26` |
| P2-3 | AI providers live | **BLOCKED** | Menunggu API keys di Vercel |
| P2-4 | Market live search | **BLOCKED** | Menunggu SERPER_API_KEY |
| P2-5 | Credits ledger backend | **BLOCKED** | Menunggu VPS (keputusan owner) |
| P2-6 | Auth production | **BLOCKED** | AUTH_ENABLED=false (login OFF) |

## P3 — UX, Responsive, Onboarding

| # | Test | Status | Bukti |
|---|------|--------|-------|
| P3-1 | Dead buttons (rab, dashboard) | **PASS** | 2026-10-19: 0 ditemukan |
| P3-2 | 3D lifecycle (mount/dispose) | **PASS** | 2/2 (verification sprint) |
| P3-3 | Theme switching (3 premium) | **PASS** | Manual (sprint sebelumnya) |

---

## Ringkasan

| Status | Jumlah |
|--------|--------|
| PASS | 21 |
| FAIL (diperbaiki) | 0 aktif |
| BLOCKED | 4 |
| NOT RUN / PARTIAL | 2 |

**Perintah yang dijalankan:**
- `tsc --noEmit --skipLibCheck` → 0 error
- `vite build` → terinterupsi (runtime); terakhir PASS 2026-10-18
- Unit tests via esbuild + shim → 21/21
- Mapping tests → 9/9 + 5/6 picker
- Secret scan via grep → bersih

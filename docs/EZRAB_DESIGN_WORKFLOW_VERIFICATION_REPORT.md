# EZRAB DESIGN WORKFLOW VERIFICATION REPORT

**Tanggal:** 2026-10-19
**Acuan:** `docs/EZRAB_DESIGN_WORKFLOW_COMPLETION_REPORT.md`
**Branch:** `integrasi/unified-ui-engine` (HEAD 527fe6c)
**Batasan dipatuhi:** tidak ada commit/push/merge/deploy/migrasi; tidak ada perubahan harga AHSP; tidak ada klaim backend.

## 1. Audit Awal

| Item | Hasil |
|------|-------|
| File diklaim berubah | ✅ Terverifikasi ada: `AiDesignStudio.tsx`, `specEngine.ts`, `DesignSpreadsheet.tsx`, `designExcelExport.ts` (baru), `designStorage.ts` (baru), `view.tsx` |
| Klaim "tombol Kirim ke RAB via bulkAddRabItems" | ✅ Ada di kode (line 98) |
| Klaim "cegah duplikat via cek code" | ✅ Ada di kode (line 89-94) |
| Klaim "harga selalu PRICE_UNRESOLVED" | ✅ Ada di kode |
| Klaim "4 sheet XLSX via ExcelJS" | ✅ Terverifikasi byte-level (lihat §3) |
| Klaim "localStorage ezrab_designs per project" | ✅ Terverifikasi 13/13 (lihat §4) |
| Perubahan user lain | ✅ Tidak disentuh (file game-space, blog tidak ada di diff saya) |

## 2. E2E Design → QTO/RAB (Browser, Playwright)

**Metode:** Browser E2E nyata (Chromium headless), skenario wizard penuh.

| # | Tahap | Status | Bukti |
|---|-------|--------|-------|
| 1 | Chat "buatkan saya RAB rumah" → wizard | ✅ PASS | Overlay wizard terbuka |
| 2 | Wizard (defaults 90m²) → konfirmasi → studio | ✅ PASS | Spec aktual: 90m², Kamar Tidur |
| 3 | Review → "Setujui Desain" enabled | ✅ PASS | Warning layout tidak memblokir |
| 4 | "Kirim ke RAB" → dialog konfirmasi | ✅ PASS | Daftar item tampil |
| 5 | "Ya, Kirim ke RAB" → sukses | ✅ PASS | Pesan "berhasil dikirim ke RAB" |
| 6 | Item di RAB proyek (navigasi "Buka RAB") | ✅ PASS | Item "Dinding" muncul di RAB |
| 7 | Kirim ulang lintas-sesi → duplikat dicegah | ✅ PASS | Pesan "duplikat", item tidak dobel |
| 8 | 0 page errors | ✅ PASS | — |

**Item RAB nyata yang tersimpan (dari localStorage):**
- `DSN-W-001` "Dinding bata perimeter", 20.16 m³
- `DSN-F-001` "Pelat lantai dasar", 10.8 m³
- `DSN-F-002` "Lantai keramik", 90 m²
- Semua: `priceStatus: 'PRICE_UNRESOLVED'`, `volumeSource: 'AI_GENERATED'`, `ahspCode: null`

### Bug Ditemukan & Diperbaiki (2)

**BUG-1 (KRITIS): Overlay tertutup saat klik "Setujui Desain"**
- Penyebab: `onApprove={() => setRabWizardOpen(false)}` di `view.tsx` (DesignWizardFlowLazy) dan `onApprove={() => setDesignStudioOpen(false)}` (DesignStudioLazy) — approval langsung menutup overlay sebelum user bisa klik "Kirim ke RAB".
- Perbaikan: Hapus `onComplete`/`onApprove` yang menutup overlay. Overlay hanya ditutup via tombol "✕ Tutup".
- File: `src/ai-tools/ezrab-ai/view.tsx` (2 baris)

**BUG-2 (MINOR): Provenance notes tidak tersimpan**
- Penyebab: `createRabItemRecord` tidak meneruskan field `notes` ke item.
- Perbaikan: Provenance dipindah ke prefix deskripsi `"[AI Design] ..."`.
- File: `src/ai-design/AiDesignStudio.tsx`
- Catatan: `volumeSource: 'AI_GENERATED'` tetap tersimpan via factory.

### Catatan Harga (bukan bug)
Item tersimpan menunjukkan `unitPrice: 0` (bukan null). Ini adalah **perilaku factory yang disengaja** (`rabItemFactory.ts` line 72: `PRICE_UNRESOLVED → 0`, dari audit 2026-10-18). Aturan null≠Rp0 dipertahankan via `priceStatus: 'PRICE_UNRESOLVED'`, bukan via `unitPrice`. Tidak diubah (integrity gate).

## 3. Verifikasi XLSX (Parser Readback Nyata)

**Metode:** Kode produksi asli (`exportDesignToExcel`) di-bundle → generate dari `parseHousePrompt` nyata → tulis ke disk → baca ulang dengan ExcelJS asli → verifikasi per-sel.

| # | Cek | Status |
|---|-----|--------|
| 1 | File ter-generate (9.879 bytes) | ✅ PASS |
| 2 | 4 sheet persis: Ringkasan, Daftar Ruang, Dimensi, Data QTO | ✅ PASS |
| 3 | Header Ringkasan benar | ✅ PASS |
| 4 | Luas Bangunan = 90 (number, bukan teks) | ✅ PASS |
| 5 | Jumlah Ruang = 8 (cocok spec) | ✅ PASS |
| 6 | Sumber jujur ("bukan gambar kerja") | ✅ PASS |
| 7 | Daftar Ruang: 8/8 baris cocok spec | ✅ PASS |
| 8 | Nama & luas per ruang cocok | ✅ PASS |
| 9 | Dimensi: header + 3 baris | ✅ PASS |
| 10 | Harga Satuan selalu null (3/3) | ✅ PASS |
| 11 | Status = "BELUM TERSEDIA" | ✅ PASS |
| 12 | Highlight kuning (argb FFFF3CD) di kolom harga | ✅ PASS |
| 13 | CSV tetap berfungsi (9 baris, header benar) | ✅ PASS |

**XLSX: 13/13 PASS. Tidak ada harga palsu di file.**

## 4. Verifikasi Persistensi (Project A vs B)

**Metode:** Fungsi produksi asli (`designStorage.ts`) dengan mock localStorage.

| # | Cek | Status |
|---|-----|--------|
| 1 | Simpan desain Project A | ✅ PASS |
| 2 | ID unik untuk desain kedua | ✅ PASS |
| 3 | Desain pertama tidak tertimpa | ✅ PASS |
| 4 | Round-trip: spec identik (dimensi, ruang, luas) | ✅ PASS |
| 5 | ID & nama cocok setelah muat | ✅ PASS |
| 6 | Project B hanya punya desainnya | ✅ PASS |
| 7 | Project A tidak bocor ke B | ✅ PASS |
| 8 | Project B tidak bocor ke A | ✅ PASS |
| 9 | Corrupt JSON → list kosong, tidak crash | ✅ PASS |
| 10 | Storage kosong → list kosong | ✅ PASS |
| 11 | getDesign ID salah → null | ✅ PASS |
| 12 | deleteDesign berhasil | ✅ PASS |
| 13 | deleteDesign ID salah → false | ✅ PASS |

**Persistensi: 13/13 PASS. Label "Backend server: BLOCKED (menunggu VPS)" jujur dan tetap ada.**

## 5. Regression & Kualitas

| Test | Hasil |
|------|-------|
| tsc (ai-design + view.tsx) | ✅ 0 error (perbaiki 5 error THREE namespace via `import type`) |
| Unit aiDesign | ✅ 13/13 PASS |
| Unit commandCenter | ✅ 8/8 PASS |
| Mobile 390px (studio, overflow, errors) | ✅ 3/3 PASS |
| 3D lifecycle (canvas, buka/tutup 3x) | ✅ 2/2 PASS |
| Chat biasa (intent routing) | ✅ 8/8 PASS (commandCenter) |
| File AHSP/resolver/factory | ✅ Tidak diubah sprint ini |

## 6. File Diubah Sprint Ini

| File | Perubahan |
|------|-----------|
| `src/ai-tools/ezrab-ai/view.tsx` | BUG-1: hapus auto-close overlay saat approve (2 lokasi) |
| `src/ai-design/AiDesignStudio.tsx` | BUG-2: provenance via prefix deskripsi |
| `src/ai-design/HouseViewer3D.tsx` | tsc: `import type * as THREE` |

## 7. Status Akhir: **PASS WITH GAPS**

**Yang terbukti:**
- E2E Design → QTO/RAB penuh berfungsi (8/8)
- XLSX byte-level verified (13/13), tidak ada harga palsu
- Persistensi terisolasi per-project (13/13)
- 2 bug nyata ditemukan & diperbaiki
- 21/21 unit test, tsc bersih, mobile & 3D OK

**Kesenjangan tersisa:**
1. Item dikirim sebagai pekerjaan generik (`DSN-W-001`, dll), bukan item AHSP spesifik — sesuai requirement "jangan menganggap dimensi = item AHSP"
2. Backend persistensi = BLOCKED (keputusan owner: tunggu VPS)
3. Vite dev server mati berulang karena runtime restart (environment, bukan bug produk)

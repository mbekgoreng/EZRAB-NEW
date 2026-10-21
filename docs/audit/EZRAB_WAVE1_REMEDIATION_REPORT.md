# EZRAB — Remediation Wave 1 Report (2026-10-20)

Scope: EXP-01 (Excel) + AI-01 (Chat AI routing). Branch `integrasi/unified-ui-engine` @ `dd81439` + perubahan Wave 1 (**BELUM COMMIT**, sesuai aturan). File berubah: 3.

---

## TASK A — EXP-01 Excel Formula Integrity

### Reproduksi & root cause (TERVERIFIKASI)
- 18 assignment formula berawalan `=` di `src/export/excelExportEngine.ts` (baris 1560, 1588, 1651, 1652, 1682, 1710, 1713, 1820, 1821, 1822, 1823, 1825, 1826, 1827, 1828, 1830, 1831, 1923) — semua di builder Schedule, Kurva-S, Cashflow. 25 assignment lain di file yang sama TANPA `=` (pola benar).
- Workbook hasil generate (fixture deterministik) membuktikan dampaknya di level file: **61 sel** formula tertulis sebagai `<f>=IFERROR(...)</f>` (sheet12: 19, sheet13: 36, sheet14: 6) — melanggar spesifikasi OOXML (teks formula tidak boleh memuat `=`; ExcelJS menulis string apa adanya ke elemen `<f>`). Nilai cache `result` menutupi kerusakan saat file pertama dibuka.
- Perilaku viewer dibedakan secara jujur: **LibreOffice toleran** (menelan `=` dan tetap menghitung ulang — terbukti saat validasi baseline), sedangkan MS Excel berisiko menampilkan dialog perbaikan konten dan membuang formula. Excel tidak tersedia di environment ini → perilaku Excel = NEEDS_ACCESS, tidak diklaim.

### Perbaikan
Hapus karakter `=` di depan pada 18 titik. Tidak ada perubahan formula, referensi sel, nilai cache, tanggal, durasi, atau total.

### Validasi (engine independen: LibreOffice headless, cache value dibuang paksa sebelum recalc)
Fixture independen: directCost Rp 27.000.000 (A: 7jt, B: 20jt), grandTotal Rp 32.967.000.
| Pemeriksaan | Hasil |
|---|---|
| XML workbook sesudah fix: `<f>=` tersisa | **0** (total formula utuh 94) |
| Schedule bobot E7–E11 vs hitung manual (7/27, 5/27, 2/27, 20/27, 20/27) | **COCOK semua** |
| Schedule D12 total & E12 | 27.000.000 ✔ · 1,0 ✔ |
| Kurva-S kumulatif akhir F11 & biaya I11 | 1,0 ✔ · Rp 32.967.000 ✔ |
| Cashflow E = B−C−D, 6 baris | **Konsisten 6/6** |
| Circular reference | Tidak ada (recalc LO tuntas tanpa error) |
| Test exportHonesty | 5/5 PASS |
**Status 18 titik: PASS semua** (diperbaiki + terverifikasi di file hasil + recalc independen pada sheet yang mereka layani).

---

## TASK B — AI-01 Chat AI Routing

### Alur aktual (ditelusuri dari kode)
UI `ezrab-ai/view.tsx` (state mode 'fast'|'advanced') → `service.ts` (productId 'EZRAB_AI' + mode) → POST `/api/ai/tools/execute` → `productIdToMode` lama memaksa semua selain DED_AI_DETAIL ke 'fast' → `aiGateway.js` memakai hasil mapper **menimpa** mode klien → rantai 'fast' selalu. Klaim audit TERBUKTI.

### Bukti baseline (harness gateway, fetch tiruan, kunci dummy)
- Pra-fix: Cepat → DeepSeek pertama; Mendalam → DeepSeek pertama (**identik, toggle no-op**). Keduanya FAIL terhadap perilaku yang dimaksudkan.

### Perbaikan (sempit, 2 file)
1. `api/ai/tools/execute.js` — mapper sadar-mode: EZRAB_AI + 'fast' → **'chat'** (River NVIDIA Nemotron → River DeepSeek → Dahl → ZyRouter + ekor); EZRAB_AI + 'advanced' → **'advanced'** (ZyRouter geminiflash-3.8 → Gemini lite + ekor); DED_AI_DETAIL tetap 'advanced'; produk lain tetap 'fast'. Komentar file kini mendokumentasikan rantai per produk.
2. `api/_lib/aiGateway.js` (1 baris) — mapper kini menerima `input.mode` sebagai argumen kedua. Mapper lain (chat.js, multi-provider tanpa mapper) tidak terpengaruh.

### Uji sesudah fix — 7/7 PASS
| Skenario | Hasil |
|---|---|
| S1 Chat Cepat | Provider pertama: **River NVIDIA Nemotron** ✔ |
| S2 Chat Mendalam | Provider pertama: **ZyRouter geminiflash-3.8** ✔ (berbeda dari S1 — toggle nyata) |
| S3 NVIDIA balas 500 | Fallback ke River DeepSeek ✔ |
| S4 DED_AI_DETAIL (regresi) | Tetap ZyRouter pertama ✔ |
| S5 DOKUMEN_AI (regresi) | Tetap DeepSeek pertama (fast) ✔ |
| S6 Tanpa kunci provider | **502 jujur** "AI sedang tidak tersedia." ✔ |
| S7 NVIDIA abort (simulasi timeout) | Pulih via fallback DeepSeek ✔ |

Catatan kejujuran: timeout 55 dtk per percobaan tidak diuji waktu-nyata (disimulasikan via AbortError); rantai 'chat' sungguhan ke provider live tidak dipanggil dalam uji ini (fetch tiruan) — pembuktian urutan provider berbasis kontrak request yang dikirim gateway. Tidak ada secret yang tampil (kunci dummy proses-lokal).

---

## Regresi umum
- TypeScript: 0 error ✔
- Vite build: PASS (1m 36s) ✔
- test:core: **74/74 PASS** ✔
- exportHonesty: 5/5 PASS ✔
- Diff final: 3 file (aiGateway 1 baris; execute.js mapper+dokumentasi; excelExportEngine 18 string formula). Tidak ada area lain tersentuh.

## Belum selesai / langkah berikutnya
- Perilaku MS Excel terhadap file lama: NEEDS_ACCESS (tidak ada Excel di environment) — file BARU sudah sesuai spesifikasi sehingga risiko ini tertutup untuk ekspor berikutnya.
- AI-02/AI-03 (duplikasi ekor & fallback advanced melampaui dokumentasi) belum disentuh — di luar scope Wave 1.
- Commit menunggu persetujuan owner; dua commit lokal sebelumnya (9d60013, dd81439) juga masih belum di-push.

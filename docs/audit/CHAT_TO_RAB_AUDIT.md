# Chat-to-RAB Workspace — Audit Alur Aktual (Fase 1) & Rencana

Tanggal: 2026-10-21 · Status: Fase 1 SELESAI, Fase 2 SELESAI (terverifikasi), Fase 3–6 implementasi.
Basis: branch `integrasi/unified-ui-engine` @ ae25c64 + perbaikan navigateChat (belum commit).

## A. Peta alur lama (sebelum Fase 2)

```
Ketik "buatkan rab rumah…" ─ intentRouter START_RAB_WIZARD ─┐
Ketik "buatkan rumah 90 m"  ─ intentRouter START_HOUSE_DESIGN ─┤ executeIntent
Tombol "Rumah tinggal"      ─ handleActionButton ────────────┘   │ flag openRabWizard /
                                                                  │ openDesignStudio
                                                                  ▼
view.tsx ── overlay fixed (z-60, backdrop) ──► DesignWizardFlow ──► RabWizard (5 langkah:
   tipe → dimensi → ruangan → lokasi & kualitas → konfirmasi) ──wizardToPrompt──►
   AiDesignStudio (prompt → parseHousePrompt [lokal] → HouseSpec) ── tab:
   Spesifikasi (FloorPlan2D, asumsi, validasi) → Spreadsheet (DesignSpreadsheet → QTO)
   → Review & Setujui (buildApprovalSummary, pemetaan AHSP manual, kirim ke RAB)
```

## B. Akar masalah

1. **Tiga pemicu popup otomatis** — dua pola intent dari teks ketikan + satu handler
   tombol — semuanya membuka overlay pada siklus submit yang sama, tanpa tahap
   peninjauan kebutuhan. Pengguna tidak pernah mengonfirmasi apa yang dipahami sistem.
2. **Prompt desain diisi default diam-diam** bila teks tak memuat angka
   (`START_HOUSE_DESIGN` fallback prompt 90 m²/3KT/2KM/carport).
3. **Overlay, bukan halaman** — wizard & studio dirender sebagai `position: fixed`
   di dalam view chat (view.tsx): tidak ada URL, tombol kembali browser tidak
   bermakna, state hilang saat overlay ditutup, konteks proyek hanya implisit.
4. **Status validasi ambigu** — `validateSpec` memisahkan issues (blokir) dan
   warnings (overlap ruang, keluar batas tapak), tetapi UI tidak punya status
   gabungan: spesifikasi dengan konflik geometri tetap tampil "lolos" dan bisa
   disetujui. Asumsi tampil, tetapi tidak memengaruhi status.
5. **Penolakan item ke RAB ditampilkan via `alert()`** (handleApprove) — bukan
   ringkasan inline lolos / perlu review / terblokir.
6. **Draft wizard hilang** — DesignWizardFlow tidak menyimpan RabWizardData;
   kembali dari studio ke wizard me-remount formulir dari nol.
7. **Rumah-sentris** — HouseSpec/parseHousePrompt/RabWizard memang khusus rumah;
   permintaan non-rumah tetap disedot ke wizard rumah (diperbaiki di Fase 2 sisi
   chat; model data tetap rumah — batas kemampuan aktual, dinyatakan jujur).

Yang SUDAH benar dan dipertahankan: parseHousePrompt lokal deterministik;
validateSpec (issues vs warnings); spreadsheetToWorkItems dengan
`unitPrice: null` + `PRICE_UNRESOLVED` (tidak pernah Rp0); validateWorkItemsForRab;
buildApprovalSummary; pemetaan AHSP manual via AhspCandidatePicker (tanpa
auto-mapping); kirim ke RAB via bulkAddRabItems dengan cegah duplikat +
`volumeSource: AI_GENERATED`; designStorage (simpan/muat desain per proyek).

## C. Alur baru (target)

```
Chat ─ "buatkan rab rumah 2 lantai" ─► CREATE_RAB_SUMMARY (Fase 2 ✔)
  ringkasan kebutuhan terekstrak (hanya yang disebut) + tombol:
  [Buka Workspace Desain & RAB] [Lengkapi kebutuhan] [Mulai manual]
        │ klik (= persetujuan) + requestAiEntry('design_workspace', prompt)
        ▼
/app/projects/:id/desain-rab  (atau /app/desain-rab) — HALAMAN PENUH
  Header: kembali ke chat · nama proyek · status draft
  Progress: Kebutuhan → Desain → Validasi → QTO → AHSP & Harga → Review
  Isi: DesignWizardFlow (wizard = langkah Kebutuhan, data tersimpan di state
  halaman) → AiDesignStudio (tab Spesifikasi/Spreadsheet/Review memajukan
  progress) dengan status validasi tiga tingkat VALID / NEEDS_REVIEW / BLOCKED
  dan ringkasan kirim-ke-RAB: lolos / perlu review / terblokir (inline).
```

## D. Komponen

| Komponen | Keputusan | Alasan |
|---|---|---|
| intentRouter, actionRegistry | DIUBAH (Fase 2 ✔) | sumber pemicu otomatis |
| rabNeeds.ts | BARU (Fase 2 ✔) | ekstraksi kebutuhan murni & tertest |
| view.tsx overlay wizard/studio | DIPERTAHANKAN, bukan lagi jalur utama chat | jangan hapus tanpa audit; jalur lain mungkin memakai |
| RabWizard | DIUBAH kecil: prop `initialData` | draft tidak hilang saat kembali (Fase 4) |
| DesignWizardFlow | DIUBAH kecil: simpan wizardData + callback fase/tab | jadi isi workspace; progress nyata |
| AiDesignStudio | DIUBAH kecil: `onTabChange`, strip status 3 tingkat, ringkasan review inline | Fase 5–6 tanpa engine baru |
| specEngine, designToRabBridge, DesignSpreadsheet, AhspCandidatePicker, designStorage | DIPERTAHANKAN apa adanya | kontrak data sudah jujur & benar |
| ChatToRabWorkspace.tsx | BARU | shell halaman + progress (Fase 3) |
| routes.ts, aiNavigation.ts, WorkspaceView.tsx | DIUBAH kecil: menu `desain-rab` + destination `design_workspace` | pola route/entry yang sudah ada, tanpa item sidebar baru |
| FloorPlan2D, HouseViewer3D | DIPERTAHANKAN | visualisasi yang ada |

## E. Batas yang dinyatakan jujur

- Model desain tetap khusus bangunan rumah (HouseSpec) — pekerjaan jalan/
  drainase diarahkan ke template/DED/manual sejak Fase 2, tidak dipaksa.
- Harga tetap null/PRICE_UNRESOLVED sampai pemetaan AHSP manual — tidak berubah.
- Tidak ada migrasi DB, tidak ada engine/generator duplikat, tidak ada commit/push.

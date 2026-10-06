# AUDIT SOURCE CODE AKTUAL: EZRAB AI COASSISTANT QUICK ACTIONS

Tanggal Audit: 16 September 2026  
Target Sistem: Quick Actions pada EZRAB AI CoAssistant (Chatbox, Full View, dan Magic AI Super View)

---

## 1. Ringkasan Eksekutif Audit

Berdasarkan audit mendalam terhadap source code frontend (`EzrabCoAssistantChatbox.tsx`, `EzrabAiAssistantFullView.tsx`, `MagicAiSuperView.tsx`, `coAssistantService.ts`, `aiApiClient.ts`, `aiProviderEngine.ts`) dan backend (`server/index.ts`, `server/api/aiRoutes.ts`, `server/orchestrator/aiOrchestrator.ts`, `server/orchestrator/intentClassifier.ts`, `server/services/autoAnswerEngine.ts`, `server/services/commandEngine.ts`), ditemukan bahwa tombol **Quick Actions saat ini hanya mengirimkan string prompt panjang ke chatbox tanpa menginisiasi state dialog dua arah (interactive conversational workflow)**.

### Temuan Kunci:
1. **Tidak Ada Structured Action Payload**: Tombol Quick Action mengeksekusi `onClick={() => handleSendMessage(action.prompt)}`, mengirimkan teks panjang kaku seperti *"Lakukan audit menyeluruh pada RAB proyek ini..."* alih-alih mengirimkan event terstruktur `QUICK_ACTION_TRIGGER` dengan `actionId` stabil.
2. **Ketiadaan Multi-Turn Clarification Flow**: Jika proyek aktif belum dipilih atau parameter (seperti jenis pekerjaan volume, kata kunci AHSP, periode laporan) belum ada, AI langsung membalas dengan teks umum atau gagal total karena kekurangan parameter, bukannya mengajukan pertanyaan klarifikasi dengan kartu pilihan interaktif.
3. **Pilihan Interaktif Tidak Terintegrasi pada Thread Percakapan**: Komponen perender saat ini hanya memiliki `AssistantWizardRenderer` untuk Wizard Pembuatan RAB Type Rumah, belum memiliki `QuickActionDialogueRenderer` untuk 10 quick action lainnya (Audit, QTO, AHSP, Harga, DED, Laporan, Kurva S, Explain Item, Recalculate, Bantuan Fitur).
4. **Resiko Mutasi Tanpa Preview & Konfirmasi Formal**: Aksi `RECALCULATE` dan `BUAT_LAPORAN` belum memiliki antarmuka diff preview transaksional di dalam thread chat.
5. **Ketiadaan Follow-Up Suggestions Kontekstual**: Setelah AI memberikan jawaban atas Quick Action, pengguna tidak disajikan 2–4 tombol saran tindak lanjut berikutnya.

---

## 2. Tabel Audit Komprehensif 10 Quick Actions

| # | Action ID | Label Tombol | Icon | File Sumber | Handler Aktual | Endpoint Dipanggil | Response yang Diterima | User Msg? | AI Msg? | Context Retained? | Masalah & Akar Masalah | Status Aktual |
|---|-----------|--------------|------|-------------|----------------|-------------------|------------------------|-----------|---------|-------------------|------------------------|---------------|
| 1 | `AUDIT_RAB` | Audit RAB | `CheckCircle2` | `EzrabCoAssistantChatbox.tsx` | `handleSendMessage(prompt)` | `POST /api/ai/chat` | Teks panjang / Anomali summary | Ya (teks panjang) | Ya (statis/dataset) | Parsial | Tanpa pertanyaan fokus audit (volume, harga, AHSP, duplikasi) dan tanpa pemilihan sumber RAB jika proyek kosong. | **PARTIALLY_WORKING** |
| 2 | `HITUNG_VOLUME` | Hitung Volume | `Search` | `EzrabCoAssistantChatbox.tsx` | `handleSendMessage(prompt)` | `POST /api/ai/chat` | Teks umum QTO | Ya (teks panjang) | Ya (statis) | Parsial | Tidak menampilkan pilihan jenis pekerjaan (beton, galian, pasangan bata) dan form input dimensi geometri terverifikasi. | **PARTIALLY_WORKING** |
| 3 | `CARI_AHSP` | Cari AHSP | `Sparkles` | `EzrabCoAssistantChatbox.tsx` | `handleSendMessage(prompt)` | `POST /api/ai/chat` | Teks / Tabel AHSP parsial | Ya (teks panjang) | Ya | Parsial | Tidak menanyakan kategori pekerjaan (tanah, beton, finishing, dll.) dan wilayah/versi AHSP secara interaktif. | **PARTIALLY_WORKING** |
| 4 | `CARI_HARGA` | Cari Harga | `Search` | `EzrabCoAssistantChatbox.tsx` | `handleSendMessage(prompt)` | `POST /api/ai/chat` | Teks / Daftar harga | Ya (teks panjang) | Ya | Parsial | Tidak menyediakan kategori sumber (material, upah, alat) dan spesifikasi sebelum pencarian dilakukan. | **PARTIALLY_WORKING** |
| 5 | `ANALISIS_DED` | Analisis DED | `FileText` | `EzrabCoAssistantChatbox.tsx` | `handleSendMessage(prompt)` | `POST /api/ai/chat` | Teks ekstraksi / Request file | Ya (teks panjang) | Ya | Parsial | Tidak menampilkan kartu upload file atau opsi pemilihan disiplin gambar (arsitektur, struktur, MEP, QTO). | **PARTIALLY_WORKING** |
| 6 | `BUAT_LAPORAN` | Buat Laporan | `FileText` | `EzrabCoAssistantChatbox.tsx` | `handleSendMessage(prompt)` | `POST /api/ai/chat` | Teks draft laporan | Ya (teks panjang) | Ya | Parsial | Tidak menanyakan jenis laporan (progres, biaya, RAB, mingguan) dan belum ada kartu preview konfirmasi sebelum ekspor. | **PARTIALLY_WORKING** |
| 7 | `PERIKSA_KURVA_S` | Periksa Kurva S | `CheckCircle2` | `EzrabCoAssistantChatbox.tsx` | `handleSendMessage(prompt)` | `POST /api/ai/chat` | Teks deviasi / Bobot | Ya (teks panjang) | Ya | Parsial | Tidak menyediakan pilihan fokus analisis (bobot pekerjaan, deviasi rencana vs aktual, jalur kritis). | **PARTIALLY_WORKING** |
| 8 | `JELASKAN_ITEM` | Jelaskan Item | `FileText` | `EzrabCoAssistantChatbox.tsx` | `handleSendMessage(prompt)` | `POST /api/ai/chat` | Teks penjelasan formula | Ya (teks panjang) | Ya | Gagal jika no item | Jika tidak ada item aktif di spreadsheet, sistem tidak menanyakan nama item yang ingin dicari/dijelaskan. | **PARTIALLY_WORKING** |
| 9 | `RECALCULATE` | Recalculate | `CheckCircle2` | `EzrabCoAssistantChatbox.tsx` | `handleSendMessage(prompt)` | `POST /api/ai/chat` | Teks hasil kalkulasi | Ya (teks panjang) | Ya | Parsial | Berpotensi mutasi tanpa tahapan preview perbedaan nilai (diff card) dan tombol konfirmasi formal. | **BROKEN** (Safety risk) |
| 10 | `BANTUAN_FITUR` | Bantuan Fitur | `Sparkles` | `EzrabCoAssistantChatbox.tsx` | `handleSendMessage(prompt)` | `POST /api/ai/chat` | Teks daftar fitur umum | Ya (teks panjang) | Ya (statis) | Parsial | Tidak menyajikan kartu pilihan modul fitur yang dapat diklik untuk panduan interaktif step-by-step. | **PARTIALLY_WORKING** |

---

## 3. Analisis Akar Masalah (Root Cause Analysis)

1. **Frontend Trigger Architecture**:
   - `EzrabCoAssistantChatbox.tsx` menyamakan Quick Action dengan pesan teks biasa yang diketik user.
   - Tidak ada payload khusus seperti `{ type: 'QUICK_ACTION_TRIGGER', actionId: 'AUDIT_RAB', displayText: 'Audit RAB' }`.
2. **Backend State Management**:
   - `aiOrchestrator.ts` hanya mengenali `AUTOMATIC_RAB_START` untuk meluncurkan `WizardStateMachine`.
   - 9 Quick Action lainnya langsung dilempar ke `autoAnswerEngine` (dataset/knowledge base) atau tool statis tanpa siklus `ASKING_CLARIFICATION` / `COLLECTING_PARAMETERS` / `TOOL_PREVIEW`.
3. **UI Renderer Gap**:
   - Frontend hanya memiliki renderer `AssistantWizardRenderer` yang terikat pada tipe rumah. Tidak ada komponen render umum untuk *Quick Action Dialogue Cards*, *Parameter Input Forms*, *Preview Cards*, dan *Follow-Up Chips*.

---

## 4. Rekomendasi Perbaikan Menyeluruh

1. **Definisikan Kontrak Terstruktur**: Bangun `QuickActionContracts` kanonikal untuk ke-10 actions dengan parameter wajib, strategi follow-up, level risiko, dan skema validasi.
2. **Bangun `QuickActionStateMachine` Backend**: State machine multi-turn yang mengelola session percakapan, transisi langkah, pengumpulan parameter, eksekusi tool deterministik, dan preview transaksi.
3. **Bangun `QuickActionDialogueRenderer` & `QuickActionFollowUpSuggestions` Frontend**: Komponen UI modern bernuansa dark/glassmorphism yang mendukung kartu pilihan, form parameter, diff card, tombol konfirmasi, dan chip saran lanjutan.
4. **Dukungan Input Ganda (Dual-Input)**: Pengguna dapat merespons baik via klik tombol kartu ATAU mengetik teks bebas natural.
5. **Keamanan & Isolasi Multi-Tenant**: Validasi autentikasi ketat dari session Bearer token, isolasi workspace/proyek, dan konfirmasi mutasi wajib.

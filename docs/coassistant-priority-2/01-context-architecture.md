# EZRAB CoAssistant Priority 2 — Context Architecture

## 1. Desain Conversation Context Resolver
Context Resolver menggabungkan status runtime percakapan ke dalam struktur terpadu:
- `conversationId`: ID percakapan aktif.
- `activeWorkflow`: Alur aktif (misal `INTERACTIVE_RAB_WIZARD`).
- `activeProjectId` & `activeWorkspaceId`: Konteks tenant yang diverifikasi backend.
- `selectedTemplate`: ID master template yang sedang dikonfigurasi.
- `collectedParameters`: Parameter teknis yang telah diisi.
- `missingParameters`: Parameter wajib yang belum terisi.
- `unresolvedQuestions`: Daftar pertanyaan yang belum terjawab.
- `lastToolResult`: Output eksekusi alat terakhir beserta timestamp.
- `userCorrections`: Riwayat koreksi manual parameter oleh pengguna.
- `outputPreferences`: Format ekspor (Excel/PDF) dan tingkat kerincian.
- `contextVersion` & `ttlMs`: Versi konteks incremental dan masa berlaku kedaluwarsa.

## 2. Integritas Data & Validasi Backend
- Data konteks tidak pernah diambil secara langsung dari `localStorage` client sebagai sumber kebenaran final.
- Setiap resolusi konteks memverifikasi keberadaan `projectId` di dalam `workspaceId` pemanggil untuk mencegah kebocoran antar tenant.

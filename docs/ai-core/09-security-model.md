# EZRAB AI CORE — Security Model & Isolation Guard (Fase 8, 14 & 26)

> **Status:** IMPLEMENTED  
> **Versi:** 1.0.0  
> **Modul Terkait:** `server/middleware/authMiddleware.ts`, `server/middleware/isolationGuard.ts`, `server/services/answerValidator.ts`

---

## 1. Prinsip Keamanan Utama

1. **Backend as Single Source of Truth**:
   - `user_id`, `role`, dan `workspace_id` selalu diderivasi dari Bearer token resmi via Supabase Auth.
   - Header klien (`x-user-id`, `x-user-role`) diabaikan pada mode produksi.
2. **Multi-Tenant Workspace Isolation**:
   - Tidak ada pengguna yang dapat melihat atau memodifikasi data organisasi/proyek milik pihak lain.
3. **Pencegahan Prompt Injection & Jailbreak**:
   - Perintah berbahaya untuk mengungkap password, token, database connection string, atau bypass hak akses otomatis ditolak dengan status `REFUSED`.
4. **Zero Secret Leakage**:
   - API key, service role key, dan kredensial database tidak pernah dikirim ke frontend atau dicatat dalam log publik.

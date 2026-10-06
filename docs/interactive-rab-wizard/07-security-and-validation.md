# EZRAB — KEBIJAKAN KEAMANAN & VALIDASI (SECURITY & VALIDATION)
**Dokumen:** `docs/interactive-rab-wizard/07-security-and-validation.md`  
**Modul:** Interactive Automatic RAB Wizard  
**Tanggal:** 2026-09-15  

---

## 1. PRINSIP KEAMANAN UTAMA

1. **Zero Client Trust:**
   - Parameter `user_id`, `role`, atau `workspace_id` dari payload JSON body diabaikan. Identitas mutlak diambil dari `AuthMiddleware.resolveContext` (Bearer Token).
2. **Multi-Tenant Isolation Guard:**
   - Setiap pemanggilan sesi wizard memvalidasi `session.workspaceId === authCtx.workspaceId`.
   - Percobaan cross-tenant manipulasi menghasilkan `403 FORBIDDEN` / `404 NOT FOUND`.
3. **No Premature Mutation (2-Step Safety):**
   - Spreadsheet proyek dan database RAB tidak mengalami mutasi apapun sebelum endpoint `/api/assistant/wizard/:sessionId/confirm` dieksekusi secara eksplisit oleh user.
4. **Engineering Guard:**
   - Proyek risiko tinggi (Dam, Jembatan Bentang Panjang, Rumah Sakit Bedah) tidak dapat dieksekusi melalui template generik sederhana tanpa tanda tangan review engineering.

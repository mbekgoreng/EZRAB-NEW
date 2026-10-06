# EZRAB AI CORE — Function Calling & Tool Registry (Fase 12 & 13)

> **Status:** IMPLEMENTED  
> **Versi:** 1.0.0  
> **Modul Terkait:** `server/tools/toolRegistry.ts`, `server/services/commandEngine.ts`

---

## 1. Tool Registry

Tool Registry mencakup 97 tools backend terdaftar pada modul:
1. **PROJECT**: `list_projects`, `get_project`, `create_project`, `update_project`, `archive_project`, `delete_project`.
2. **RAB**: `get_rab`, `search_rab_items`, `add_rab_item`, `update_rab_item`, `delete_rab_item`, `calculate_rab`, `detect_cost_anomalies`.
3. **WBS**: `list_wbs`, `add_wbs`, `update_wbs`, `delete_wbs`, `move_wbs`.
4. **QTO**: `get_qto`, `add_qto`, `calculate_volume`, `link_qto_to_rab`.
5. **AHSP**: `search_ahsp`, `get_ahsp_detail`, `calculate_ahsp`.
6. **SCHEDULE & KURVA S**: `get_project_progress`, `update_progress`, `get_time_schedule`.
7. **REPORT**: `create_project_report`, `get_project_summary`.

---

## 2. Alur Konfirmasi Dua Tahap (Two-Stage Execution)

Untuk seluruh operasi mutasi data dan tindakan berisiko:
1. **Tahap 1 (Preview Action)**: Backend memvalidasi parameter, menghitung perkiraan dampak biaya (*cost impact*), dan mengembalikan objek `ActionProposal` dengan status `CONFIRMATION_REQUIRED`.
2. **Tahap 2 (Explicit User Confirmation)**: Tindakan hanya dieksekusi setelah pengguna mengklik tombol konfirmasi di UI melalui endpoint `POST /api/ai/actions/confirm`.

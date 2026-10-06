# STAGING PLAN REVIEW v2 — Durable Project + RAB Foundation

Tanggal: 2026-09-14 (Asia/Jakarta)  
Target: Supabase staging icemyvldjiewkzzwkjrw  
Status: PLAN REVIEW ONLY

## Guardrails and baseline

Tidak ada db push, migration up, reset, start, SQL write, schema change, migration-history change, migration final, atau perubahan public.projects.id. Applied auth_membership_foundation dan migration UUID lama tidak disentuh.

Verified: projects.id=text PK; project_members.project_id=text dengan FK komposit ke projects(id,workspace_id); workspaces.id/profiles.id=uuid; RLS existing hanya membership/self-read; seluruh tabel RAB belum ada; tabel dasar 0 baris; projects.created_by dan projects.legacy_id belum ada; history hanya auth_membership_foundation.

## 1. ROLE MATRIX — CLOSED

Identity dan role hanya dari verified auth.uid() lalu workspace_members.role. Client body, forged headers, JWT metadata buatan, localStorage, dan Map bukan sumber kebenaran.

| Role | SELECT | INSERT | UPDATE DRAFT | FINALIZE | NEW VERSION | ARCHIVE | DELETE |
|---|---|---|---|---|---|---|---|
| SUPER_ADMIN (owner/admin) | workspace+project member | document/version/item/component | Ya | Ya | Ya | Ya | DRAFT saja, audit |
| ESTIMATOR (manager) | workspace+project member | document/version/item/component | Ya | Ya | Ya | Ya | Tidak |
| EDITOR (member biasa) | workspace+project member | item/component saja | Ya | Tidak | Tidak | Tidak | Tidak |
| CLIENT | Deferred fase pertama | Tidak | Tidak | Tidak | Tidak | Tidak | Tidak |
| DIREKSI | Deferred fase pertama | Tidak | Tidak | Tidak | Tidak | Tidak | Tidak |

SUPER_ADMIN adalah owner/admin karena live model tidak memiliki owner terpisah. Project membership selalu wajib. CLIENT/DIREKSI tidak menerima policy RAB baru pada fase pertama. FINAL/ARCHIVED tidak dihapus melalui browser.

## 2. CANONICAL DATA MODEL — CLOSED

Hierarki: rab_documents → rab_versions → rab_items → rab_item_components.

- rab_items wajib memiliki rab_version_id not null.
- documents, versions, dan items menduplikasi project_id text + workspace_id uuid untuk tenant filtering/defense-in-depth.
- Konsistensi parent: FK komposit (project_id,workspace_id) ke projects(id,workspace_id), FK parent-chain, unique parent keys, dan PATCH tidak boleh memindahkan tenant/parent.
- Tepat satu DRAFT aktif per document; ditegakkan dengan unique partial constraint/index pada status DRAFT.
- FINAL immutable. Versi baru dari FINAL membuat version_number berikutnya, status DRAFT, dan copy/snapshot item yang disetujui; FINAL sumber tetap.
- ARCHIVED terminal read-only, bukan default editable, tidak dapat difinalisasi ulang.
- Components hanya dimiliki item dan mengikuti lifecycle item DRAFT.

Tidak ada SQL final yang dibuat; draft text hanya input desain.

## 3. CREATED_BY — CLOSED

created_by pada empat tabel RAB adalah uuid nullable FK profiles(id). API mengisi dari verified token/auth.uid(); browser tidak boleh mengirim sumber kebenaran. Normal authenticated create wajib mengisi; NULL hanya untuk transitional/system rows yang disetujui. Tidak ada backfill karena data dasar 0 baris dan projects.created_by belum ada. projects.created_by berada di luar schema RAB tahap pertama; repository yang saat ini mengirim field itu harus diselaraskan sebelum CRUD acceptance. created_by bukan pengganti membership.

## 4. LEGACY_ID — CLOSED

Tahap pertama tidak menambah projects.legacy_id, rab_documents.legacy_id, atau rab_items.legacy_id. projects.id adalah identifier resmi. Legacy import ditunda sampai sumber, format, mapping deterministik, collision rule, dan count/checksum reconciliation disetujui. Endpoint legacy_id harus menolak atau mengabaikannya secara eksplisit.

## 5. CONCURRENCY — CLOSED

Pilih revision bigint atomik pada mutable versions/items, default 1. updated_at tetap audit/display, bukan token concurrency.

- Normal: update bersyarat pada id + project_id + workspace_id + expected_revision; naikkan revision sekali dan updated_at atomik.
- Stale: predicate tidak cocok, 0 row berubah, HTTP 409 CONCURRENCY_CONFLICT.
- Concurrent: actor pertama menang; actor kedua 409 tanpa retry diam-diam.
- FINAL/ARCHIVED menolak business update.

Revision menghindari ketergantungan precision/clock timestamp.

## 6. BACKUP/RESTORE GATE

Belum ada backup yang diklaim tersedia. Sebelum eksekusi wajib ada evidence: snapshot/restore ID; timestamp/timezone; scope; retention/owner; restore test pada clone/disposable target; counts dan metadata fingerprint sebelum/sesudah; operator log; credential tidak masuk report/shell/source; rollback owner dan response time. Evidence tidak lengkap = eksekusi diblokir.

## 7. RLS / OWNERSHIP — CLOSED CONCEPTUALLY

Semua RAB table RLS-enabled dan policy memakai verified auth.uid().

- SELECT: workspace_members dan project_members untuk pasangan project/workspace yang sama; CLIENT/DIREKSI tidak di-scope fase pertama.
- INSERT: WITH CHECK membership + role matrix; created_by NULL atau auth.uid(), API normal mengisi auth.uid().
- UPDATE: USING row lama + WITH CHECK row baru; tenant/parent immutable; hanya DRAFT dan role sesuai matrix.
- FINALIZE: hanya ESTIMATOR/SUPER_ADMIN setelah validasi domain.
- NEW VERSION: hanya ESTIMATOR/SUPER_ADMIN dari FINAL.
- ARCHIVE: hanya ESTIMATOR/SUPER_ADMIN, terminal.
- DELETE: hanya SUPER_ADMIN pada DRAFT.
- Workspace/project isolation selalu mencocokkan row dengan membership. Invalid/unauthenticated tidak mendapat allow.

Service-role bypass bukan bukti RLS user-path. SQL policy text tetap implementation review.

## 8. SCHEMA STAGE-1 — CONCEPTUAL

- rab_documents: uuid PK; project_id text/workspace_id uuid not null; name not null; created_by nullable FK profiles; created_at/updated_at; unique project/workspace.
- rab_versions: uuid PK; rab_document_id FK document; project_id/workspace_id not null; version_number/status/revision not null; created_by nullable; timestamps; unique document/version.
- rab_items: uuid PK; rab_version_id FK version wajib; project_id/workspace_id not null; item/pricing fields; revision not null; created_by nullable; timestamps.
- rab_item_components: uuid PK; rab_item_id FK item cascade; component fields/timestamps not null; unique item/component_type/resource_code.
- Semua project references memakai text project_id + uuid workspace_id; tidak ada UUID surrogate project.

## 9. EXECUTION PLAN — FUTURE ONLY

1. Approve backup/restore evidence.
2. Re-run metadata preflight: text ID, composite FK, RAB absent, history unchanged.
3. Review one compatible-text migration proposal; applied migrations tetap immutable.
4. Apply only after plan approval + backup gate PASS.
5. Verify columns/defaults/nullability/PK/FK/unique/index/revision/RLS/policies.
6. Test authenticated CRUD per matrix.
7. Test invalid token, forged header, workspace/project crossing.
8. Test FINAL immutable, new version, ARCHIVED, stale revision 409.
9. Test restart durability and no local fallback.
10. Rollback on clone/restore point; repeat structural/RLS/aggregate checks.

## 10. ACCEPTANCE PASS/FAIL

- [ ] RAB creation by ESTIMATOR/SUPER_ADMIN creates document, DRAFT version, item, component.
- [ ] RAB read restricted to matching workspace/project.
- [ ] EDITOR/ESTIMATOR/SUPER_ADMIN DRAFT edit follows matrix.
- [ ] FINAL business edit fails with no row change.
- [ ] New version from FINAL succeeds; source remains unchanged.
- [ ] ARCHIVED is read-only and non-editable.
- [ ] Workspace and project isolation both PASS.
- [ ] Missing/invalid/expired token returns 401 without mutation.
- [ ] Forged x-user-id/x-user-role cannot change identity/permission.
- [ ] Stale revision returns 409 without overwrite.
- [ ] Restart preserves official data.
- [ ] No localStorage/in-memory Map fallback for official data.
- [ ] CLIENT/DIREKSI receive no new RAB permission.
- [ ] Backup/restore evidence and reproducible restore test PASS.

## 11. DESIGN DECISIONS CLOSED

Role matrix and deferred CLIENT/DIREKSI; mandatory rab_version_id; duplicated tenant keys with composite FK; one active DRAFT; FINAL immutable; new version from FINAL; ARCHIVED terminal; nullable verified-token created_by with no backfill; legacy_id omitted; atomic revision with 409; conceptual RLS boundaries; backup/restore as mandatory execution gate.

## FINAL DECISION

# READY FOR STAGING MIGRATION PLAN APPROVAL

All v1 design blockers have explicit decisions. This approves the plan for migration-plan approval review only; it does not authorize applying a migration. Execution still requires backup/restore evidence, final SQL review, and PASS acceptance tests.

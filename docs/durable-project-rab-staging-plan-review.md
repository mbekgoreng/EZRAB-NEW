# STAGING PLAN REVIEW — Durable Project + RAB Foundation

Tanggal: 2026-09-14 (Asia/Jakarta)  
Target: Supabase staging icemyvldjiewkzzwkjrw  
Status: plan review saja; tidak ada perubahan database atau migration history

## Guardrails

Rencana ini tidak menjalankan supabase db push, migration up, db reset, supabase start, atau SQL write apa pun. Migration auth_membership_foundation yang sudah applied tidak disentuh. Migration UUID lama tidak dihapus, diganti, atau dicatat ulang. public.projects.id tetap text.

## Verified baseline

- projects.id: text, primary key.
- projects.workspace_id: uuid, FK ke workspaces(id).
- project_members.project_id: text; FK komposit (project_id, workspace_id) ke projects(id, workspace_id).
- workspaces.id dan profiles.id: uuid.
- RLS aktif pada projects, project_members, profiles, dan workspaces; policy yang ada adalah policy SELECT membership/self-read.
- Keempat tabel RAB belum ada; data tabel dasar saat ini 0 baris.
- projects.created_by dan projects.legacy_id belum ada.

## A. ID strategy

1. Pertahankan projects.id text tanpa cast, rename, surrogate replacement, atau perubahan PK.
2. Semua kolom RAB yang menunjuk project menggunakan project_id text.
3. PK entitas baru (rab_documents.id, rab_versions.id, rab_items.id, rab_item_components.id) menggunakan uuid default gen_random_uuid().
4. Setiap tabel RAB yang menyimpan project scope juga menyimpan workspace_id uuid not null.
5. Gunakan FK komposit (project_id, workspace_id) references projects(id, workspace_id) on delete cascade, bukan FK project-only.

projects.id memang globally unique saat ini, tetapi FK komposit tetap menjadi guardrail tenant dan konsisten dengan project_members. Validasi harus membuktikan project ID dari workspace A tidak dapat dipakai bersama workspace_id B.

## B. created_by

created_by uuid cocok secara tipe dengan profiles.id dan dapat memakai FK ke profiles(id). Namun kolom itu belum ada pada projects dan tidak ada bukti ownership mapping data lama.

- Rencanakan kolom baru sebagai nullable pada fase pertama.
- Jangan membuat keputusan backfill atau NOT NULL tanpa mapping owner yang disetujui dan diverifikasi.
- Create API mengambil subject dari token terverifikasi (auth.uid()/identity resolver), bukan body, localStorage, x-user-id, atau x-user-role.
- Create API mengisi created_by = verifiedUserId dan gagal tertutup bila profile/membership yang diperlukan tidak ada.
- created_by adalah audit/provenance, bukan pengganti membership.

Repository saat ini mengirim created_by saat membuat project/RAB, tetapi projects.created_by belum ada. API dan schema contract harus diselaraskan sebelum CRUD resmi diuji.

## C. legacy_id

projects.id sudah menjadi identifier resmi. Keputusan tahap pertama: jangan menambah projects.legacy_id atau rab_documents.legacy_id tanpa sumber legacy yang terdokumentasi. rab_items.legacy_id juga ditunda kecuali kebutuhan import dibuktikan.

Jika import legacy disetujui kemudian, wajib ada sumber/format, mapping deterministik, aturan collision, duplicate check, dan rekonsiliasi count/checksum. Endpoint yang menerima legacy_id harus menolak atau mengabaikannya secara eksplisit sampai keputusan dibuat; jangan menyimpan identifier tanpa semantik resmi.

## D. Relasi workspace dan project

Semua path RAB wajib memeriksa pasangan project_id + workspace_id.

- workspace_id pada RAB FK ke workspaces(id).
- (project_id, workspace_id) FK ke projects(id, workspace_id).
- Policy memakai workspace_members dengan workspace_id = row.workspace_id dan user_id = auth.uid().
- Policy project memakai project_members dengan project_id, workspace_id, dan user_id = auth.uid().
- Query aplikasi selalu mengikat kedua kolom; workspace dari client tidak dipercaya tanpa pencocokan project.

## E. Schema tahap pertama (rancangan, bukan migration final)

### rab_documents

PK id uuid; project_id text not null; workspace_id uuid not null; FK komposit project/workspace dan FK workspace; name text not null default RAB Utama; created_by uuid nullable FK profiles; created_at dan updated_at timestamptz not null default now(); unique (project_id, workspace_id).

### rab_versions

PK id uuid; rab_document_id uuid not null FK rab_documents on delete cascade; project_id text/workspace_id uuid not null dengan FK komposit project/workspace; version_number integer not null check > 0; status not null dengan minimal DRAFT, FINAL, ARCHIVED; created_by uuid nullable FK profiles; created_at not null; unique (rab_document_id, version_number). FINAL immutable; perubahan membuat versi baru.

### rab_items

PK id uuid; rab_version_id uuid not null FK rab_versions; project_id text/workspace_id uuid not null dengan FK komposit project/workspace; item_number nullable; code dan description not null; specification nullable; volume numeric not null check >= 0; unit not null; harga material/labor/equipment/unit/amount not null default 0 dengan validasi domain; AHSP fields nullable; created_by nullable FK profiles; created_at/updated_at not null. Unique item number/code per version hanya setelah aturan penomoran disetujui.

### rab_item_components

PK id uuid; rab_item_id uuid not null FK rab_items on delete cascade; component_type, resource_code, resource_name, unit not null; coefficient/unit_price/subtotal not null default 0; created_at/updated_at not null; unique (rab_item_id, component_type, resource_code).

### Timestamp, concurrency, audit, indexes

updated_at harus berubah atomik pada setiap update yang berhasil; default now() saja tidak cukup. Pilih trigger yang direview atau API update eksplisit. Optimistic concurrency memakai predicate id + project_id + workspace_id + expected_updated_at pada satu update atomik; tidak ada row cocok berarti HTTP 409 tanpa retry diam-diam. Audit minimum created_by, created_at, updated_at; event audit server-side boleh memakai audit_logs. Index minimum: project/workspace lookup, rab_document_id, rab_version_id, rab_item_id, dan updated_at bila diperlukan.

## F. RLS dan ownership

Semua tabel RAB RLS-enabled dan diuji lewat authenticated session nyata. Policy tidak menggunakan header buatan, role dari body, x-user-id, x-user-role, atau localStorage.

- SELECT: workspace membership dan project membership untuk pasangan project/workspace yang sama.
- INSERT: WITH CHECK yang sama; created_by harus NULL atau auth.uid(), dan API mengisi verified subject.
- UPDATE: USING membership pada row lama dan WITH CHECK membership pada row baru; project/workspace tidak boleh dipindah oleh update umum.
- DELETE: USING membership yang sama, dengan role write/delete yang disetujui; FINAL tidak boleh dihapus tanpa keputusan domain.

Read policy existing tidak otomatis memberi write access. Role matrix (misalnya estimator/editor menulis, client read-only) harus disetujui berdasarkan workspace_members.role dan direpresentasikan dalam policy. Service-role bypass hanya untuk operasi server eksplisit, bukan bukti RLS.

## G. Migration execution plan (staging only)

1. Backup/restore point: catat snapshot, waktu, owner restore, dan uji restore.
2. Validasi schema: ulangi metadata preflight; pastikan text ID, FK komposit, RAB absent, policy/index name bebas bentrok, history unchanged.
3. Review/approve: buat satu migration kompatibel text terpisah; jangan mengedit migration applied.
4. Apply di staging melalui workflow yang disetujui; belum dijalankan pada review ini.
5. Verifikasi struktur: kolom, nullability/default, PK/FK/unique/index, timestamp, RLS, policy expressions.
6. Verifikasi RLS: authenticated member, non-member, workspace/project silang, unauthenticated; SELECT/INSERT/UPDATE/DELETE terpisah.
7. Authenticated CRUD: user staging nyata dengan membership sesuai.
8. Unauthorized access: forged headers, invalid/expired token, localStorage-only identity, project/workspace mismatch ditolak.
9. Stale update: dua actor dengan updated_at sama; update pertama PASS, kedua 409/no mutation; FINAL menolak overwrite.
10. Rollback: restore snapshot/clone terverifikasi atau rollback objek baru reverse dependency; jangan sentuh projects.id, auth migration, atau history. Ulangi counts/FK/RLS/CRUD smoke test.

## H. Acceptance criteria (PASS/FAIL)

- [ ] Create project RAB: verified user membuat document/version/item; text project_id dan uuid workspace_id konsisten.
- [ ] Read project RAB: member membaca data yang sama; sumber resmi Supabase, bukan localStorage/Map.
- [ ] Update item: authorized member berhasil dengan expected_updated_at.
- [ ] Workspace isolation: workspace A tidak membaca/menulis workspace B.
- [ ] Project membership isolation: workspace member tanpa project membership ditolak.
- [ ] Forged header rejection: x-user-id/x-user-role palsu tidak mengubah identity.
- [ ] Invalid token rejection: missing/invalid/expired token 401 tanpa mutation.
- [ ] Stale updated_at rejection: stale write 409 tanpa overwrite.
- [ ] RLS enforcement: direct authenticated calls memenuhi policy; service-role test dipisahkan.
- [ ] Restart durability: restart service/browser tidak menghilangkan data resmi.
- [ ] No local fallback: official reads/writes tidak fallback ke localStorage/in-memory Map.

## Blocker tersisa

1. Role matrix policy write/delete belum disetujui.
2. Relasi canonical item ke rab_version dan aturan immutable FINAL belum disetujui.
3. Ownership/backfill created_by belum dipetakan; projects.created_by belum ada sementara repository mengirim field tersebut.
4. legacy_id belum memiliki sumber import yang disetujui.
5. Mekanisme atomik bump updated_at belum dipilih/diuji.
6. Backup/restore point dan test restore belum menjadi evidence.
7. Migration kompatibel text final belum boleh dibuat sebelum blocker disetujui.

## Status akhir

# BLOCKED — PLAN NEEDS REVISION

Baseline tipe dan metadata cukup untuk menolak migration UUID dan memilih strategi text-compatible. Plan belum siap menjadi migration staging sampai keputusan ownership/backfill, role-based RLS write/delete, relasi version canonical, timestamp concurrency, dan backup/restore disetujui serta dituangkan dalam review berikutnya.


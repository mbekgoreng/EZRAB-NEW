/**
 * EZRAB AI — Inventaris mutasi + gerbang kapabilitas terpusat (P1-B).
 *
 * INVENTARIS TUNGGAL (single source of truth): setiap intent Chat AI,
 * tool registry, dan aksi UI Chat AI/DED yang dapat menulis diklasifikasikan
 * di sini sebagai READ_ONLY / SIMULATION_ONLY / PERSISTENT_MUTATION.
 * Gerbang otorisasi (actionRegistry, push handler view.tsx, finalize DED)
 * WAJIB berkonsultasi ke `authorizeChatAiMutation` di bawah — tidak ada
 * pemeriksaan kapabilitas kedua di tempat lain. Kunci yang TIDAK ADA di
 * inventaris DITOLAK secara default (fail-closed): permukaan baru yang
 * lupa didaftarkan tidak pernah lolos diam-diam.
 *
 * Pemetaan "Admin" (§4.2 directive owner 2026-11-24): model peran yang
 * ada TIDAK punya definisi "admin" untuk data bisnis — peran server hanya
 * ada untuk billing/invitasi, dan peran demo (roleAccounts.ts) adalah
 * kapabilitas klien. Keputusan P1 (disetujui koordinator): "Admin" pada
 * §4.2 dipetakan ke capability `edit-estimate` yang SUDAH menggerbang
 * mutasi item (requireMutationGate) — peran yang memegangnya (qs,
 * estimator, konsultan, team) boleh mengeksekusi mutasi Chat AI;
 * kontraktor (tanpa edit-estimate) ditolak. Bila owner suatu saat
 * mendefinisikan peran Admin server yang sesungguhnya, SATU-SATUNYA
 * perubahan yang dibutuhkan adalah mengganti sumber bit `writesEnabled`
 * di pemanggil — keputusan di sini tidak berubah.
 *
 * ----------------------------------------------------------------------------
 *  BATAS KEJUJURAN (WC-06 — BACA SEBELUM MENYEBUT INI "OTORISASI"):
 * ----------------------------------------------------------------------------
 *  Gerbang ini adalah UX-ONLY sampai peran server mendarat. Alasannya:
 *  - Semua data bisnis hidup di localStorage browser (`ezrab_prod_*`).
 *    TIDAK ADA API server untuk mutasi bisnis — klien adalah satu-satunya
 *    titik penegakan, dan klien sepenuhnya berada di tangan pengguna.
 *  - Peran demo/PIN BUKAN batas otorisasi: kelima PIN demo tercetak di
 *    bundle (roleAccounts.ts), dan sesi peran adalah nilai localStorage
 *    yang bisa dipalsukan siapa pun (edit-estimate didapat dari sesi
 *    yang dipulihkan tanpa PIN). Siapa pun yang bisa membuka DevTools
 *    bisa mengaktifkan bit ini.
 *  - Karena itu JANGAN PERNAH menyebut gerbang ini "otorisasi",
 *    "keamanan", atau "admin-only" tanpa kualifikasi "sisi klien" —
 *    ia mencegah kesalahan & penyalahgunaan kasual lewat UI, BUKAN
 *    penyerang yang memodifikasi klien. Otorisasi yang sesungguhnya
 *    membutuhkan migrasi server + RLS (Tahap 5, di luar P1).
 * ----------------------------------------------------------------------------
 *
 * Klasifikasi:
 * - READ_ONLY: tidak menulis data apa pun (baca, jawab, navigasi,
 *   hitung, pratinjau). Tidak butuh capability.
 * - SIMULATION_ONLY: menulis HANYA state kerja/simulasi yang bukan data
 *   bisnis proyek: draft RAB (dokumen kerja — autosave-nya adalah
 *   penyimpanan dokumen kerja, bukan mutasi RAB), paket/kredit SIMULASI.
 *   Tidak butuh capability. Mutasi PERSISTEN-nya terjadi di push/finalize
 *   (yang digerbang).
 * - PERSISTENT_MUTATION: menulis data bisnis proyek (proyek, RAB, QTO,
 *   pengaturan, override harga, revisi, transfer draft) secara permanen
 *   ke localStorage. WAJIB capability + konfirmasi §6 + jejak audit.
 *   Mutasi ber-cakupan DRAFT (aktivasi revisi, koreksi QTO, revisi spek
 *   DED, lengkapan Full AI) mengubah dokumen kerja draft, bukan data
 *   proyek — P1 TIDAK menambah gerbang kapabilitas pada keempatnya
 *   (menunggu keputusan owner). Keputusan itu TIBA lewat direktif
 *   Fast Track §7 (2026-11-24): "Only authenticated Admin may execute
 *   persistent Chat AI mutations" — keempat entri cakupan-draft kini
 *   DIGERBANG capability 'edit-estimate' (peta "Admin" §4.2, sama
 *   seperti mutasi proyek). Satu-satunya pengecualian yang
 *   DIDOKUMENTASIKAN: penolakan (reject/batal) yang tidak menulis
 *   apa pun yang persisten — pembatalan revisi spek DED dan pembuangan
 *   lengkapan Full AI yang tertunda tidak digerbang (tidak ada tulis).
 */

import type { RoleCapability } from '../../auth/roleAccounts';

export type MutationClassification = 'READ_ONLY' | 'SIMULATION_ONLY' | 'PERSISTENT_MUTATION';

/** Cakupan data yang ditulis (bila PERSISTENT_MUTATION). */
export type MutationScope = 'project' | 'draft' | 'account' | 'simulation' | 'none';

/** Mekanisme konfirmasi §6 yang berlaku pada batas ini. */
export type ConfirmationMechanism =
  | 'none'
  | 'change-plan' // pratinjau ChangePlan + tombol Konfirmasi Eksekusi
  | 'direct-command' // sidik + TTL 10 mnt + sekali pakai + tombol konfirmasi
  | 'transfer-binding' // TransferApprovalBinding / DirectPushApprovalBinding
  | 'two-step' // pratinjau + tombol konfirmasi khusus (payload-terikat)
  | 'finalize-click' // klik Finalize (sesudah validate-before-insert)
  | 'button-only'; // satu klik tombol eksplisit (tanpa pratinjau terikat)

export type AuditTrailKind =
  | 'op-log' // log operasi operations.ts (item)
  | 'mutation-log' // mutationAuditLog.ts (P1-E)
  | 'transfer-receipt' // recordTransferReceipt + lastTransfer
  | 'tool-trail' // trail eksekusi toolRegistry
  | 'draft-versions' // rantai versi draft (Gate 3)
  | 'none';

export interface MutationInventoryEntry {
  /** Intent ChatIntent, nama tool registry, atau kunci aksi UI. */
  key: string;
  kind: 'intent' | 'tool' | 'ui-action';
  classification: MutationClassification;
  scope: MutationScope;
  /** Capability yang wajib dipegang peran aktif; null = tidak butuh. */
  capability: RoleCapability | null;
  confirmation: ConfirmationMechanism;
  audit: AuditTrailKind;
  /** true bila gerbang kapabilitas P1-B diberlakukan pada batas ini. */
  gatedInP1: boolean;
  notes?: string;
}

/* ------------------------------------------------------------------ */
/* Inventaris — diverifikasi terhadap kode (audit D5 §4 sebagai titik  */
/* awal; setiap baris dicocokkan ke implementasi, 2026-11-24).         */
/* ------------------------------------------------------------------ */

const READ_ONLY_INTENTS: string[] = [
  // Navigasi / buka menu & panel (tidak menulis data).
  'OPEN_TEMPLATE', 'OPEN_PROJECTS', 'OPEN_PROJECT_CREATE', 'OPEN_RAB', 'OPEN_QTO',
  'OPEN_AHSP', 'OPEN_REPORTS', 'OPEN_AI_DOCUMENTS', 'OPEN_DED_ESTIMATE', 'OPEN_SETTINGS',
  'OPEN_DASHBOARD', 'OPEN_GAME_SPACE', 'OPEN_SPREADSHEET', 'OPEN_DESIGN_WORKSPACE',
  'START_RAB_WIZARD', 'START_HOUSE_DESIGN',
  // Jawaban / tanya / klarifikasi / hitung (tanpa tulis).
  'GREETING', 'HELP', 'CAPABILITIES', 'GAME_INFO', 'KURVA_S', 'CALCULATE',
  'RAB_DATA_CHECKLIST', 'CLARIFY_TOPIC', 'CLARIFY_PICK', 'CLARIFY_QUERY', 'SEARCH_AHSP',
  'EXPLAIN_AHSP_VS_ESTIMATE', 'METHODOLOGY_MISSING_AHSP', 'HOWTO_EXCEL_EXPORT',
  'CONCEPTUAL_AHSP',
  // Kueri baca atas proyek aktif.
  'QUERY_PROJECT_TOTAL', 'QUERY_PROJECT_LIST', 'QUERY_MOST_EXPENSIVE_ITEMS',
  'QUERY_CHEAPEST_ITEMS',
  // Analisis (tanpa tulis; analisis DED TIDAK membuat proyek — negatif terverifikasi).
  'RUN_DED_ANALYSIS', 'SUMMARIZE_DOCUMENT',
  // Unduh berkas (tanpa tulis data).
  'EXPORT_PROJECT',
  // Saldo (baca saja).
  'CREDIT_BALANCE',
  // Langkah 1 dua-langkah (HANYA bertanya / pratinjau — tanpa tulis).
  'DELETE_PROJECT', 'SET_PROJECT_PRICE',
  // Permintaan pratinjau transfer (pratinjau saja; tulis di konfirmasi push).
  'TRANSFER_DRAFT',
  'UNKNOWN',
];

/** Intent pembangun draft: draft = dokumen kerja, bukan data proyek.
 *  Mutasi persistennya terjadi di push (yang digerbang). */
const DRAFT_BUILD_INTENTS: string[] = [
  'CREATE_RAB_CLARIFY', 'CREATE_RAB_DIRECT', 'GENERATE_RAB_TEMPLATE',
  'CREATE_RAB_SUMMARY', 'RAB_SUBTYPE_SELECT', 'RAB_MATERIAL_SELECT',
  'RAB_CONCEPT_SELECT', 'RAB_PROJECT_PREVIEW', 'RAB_INTAKE_OPTION',
  'RAB_INTAKE_GENERATE', 'RAB_PATH_TEMPLATE', 'RAB_FULL_AI', 'RAB_NEEDS_REFINE',
];

/** Tool baca EZRAB_AI_TOOLS (model-callable, read-only). */
const READ_ONLY_TOOLS: string[] = [
  'subtotal', 'volume_persegi', 'luas_dinding', 'persentase_level',
  'cari_ahsp', 'cari_harga', 'cari_pengetahuan_konstruksi', 'cari_fitur_ezrab',
  'hitung_qto', 'cari_kalkulator', 'cari_template_rab',
  'get_project_total', 'get_project_items', 'get_item_detail', 'get_project_labor',
  'get_project_sections', 'get_project_costliest', 'get_project_materials',
  'get_operation_history', 'get_unresolved_items',
  'get_credit_balance', 'get_subscription', 'get_usage_history', 'list_invitations',
  'get_account_summary',
];

/** Tool native registry yang read-only (TIDAK model-callable sesudah WC-03). */
const READ_ONLY_NATIVE_TOOLS: string[] = [
  'validate_spec_chain', 'analyze_draft_costs', 'detect_technical_conflicts',
  'assess_budget_feasibility', 'search_domain_candidates', 'extract_ded_specs',
  'check_qto', 'navigate',
];

export const MUTATION_INVENTORY: MutationInventoryEntry[] = [
  // ---- Intent baca -------------------------------------------------
  ...READ_ONLY_INTENTS.map((key): MutationInventoryEntry => ({
    key, kind: 'intent', classification: 'READ_ONLY', scope: 'none',
    capability: null, confirmation: 'none', audit: 'none', gatedInP1: false,
  })),
  // ---- Intent pembangun draft (simulasi / dokumen kerja) ------------
  ...DRAFT_BUILD_INTENTS.map((key): MutationInventoryEntry => ({
    key, kind: 'intent', classification: 'SIMULATION_ONLY', scope: 'draft',
    capability: null, confirmation: 'none', audit: 'none', gatedInP1: false,
    notes: 'Membangun draft RAB (dokumen kerja). §4.5: draft boleh tak-terikat; TIDAK membuat proyek. Mutasi persisten terjadi di push.',
  })),
  // ---- Intent simulasi kredit/paket ---------------------------------
  {
    key: 'TOPUP_CREDIT', kind: 'intent', classification: 'SIMULATION_ONLY', scope: 'simulation',
    capability: null, confirmation: 'none', audit: 'none', gatedInP1: false,
    notes: 'Hanya berfungsi dalam mode simulasi; akun nyata ditolak handler (bukan mutasi billing nyata).',
  },
  {
    key: 'CHANGE_PLAN', kind: 'intent', classification: 'SIMULATION_ONLY', scope: 'simulation',
    capability: null, confirmation: 'none', audit: 'none', gatedInP1: false,
    notes: 'Ganti paket SIMULASI (tanpa efek billing nyata).',
  },
  // ---- Mutasi item RAB (referensi §6 — sudah digerbang sebelum P1) --
  ...(['UPDATE_ITEM_VOLUME', 'UPDATE_ITEM_PRICE', 'DELETE_ITEM', 'ADD_ITEM', 'UNDO_LAST'] as const)
    .map((key): MutationInventoryEntry => ({
      key, kind: 'intent', classification: 'PERSISTENT_MUTATION', scope: 'project',
      capability: 'edit-estimate', confirmation: 'change-plan', audit: 'op-log', gatedInP1: true,
      notes: 'Gerbang pra-P1 (requireMutationGate → ChangePlan → tombol Konfirmasi Eksekusi). Tidak diubah P1.',
    })),
  // ---- Perintah langsung proyek/pengaturan/QTO (P1-B + P1-C) ---------
  ...(['CREATE_PROJECT', 'ARCHIVE_PROJECT', 'DUPLICATE_PROJECT', 'RENAME_PROJECT',
      'UPDATE_PROJECT_SETTINGS', 'CREATE_QTO_ITEM', 'SYNC_QTO'] as const)
    .map((key): MutationInventoryEntry => ({
      key, kind: 'intent', classification: 'PERSISTENT_MUTATION', scope: 'project',
      capability: 'edit-estimate', confirmation: 'direct-command', audit: 'mutation-log', gatedInP1: true,
      notes: 'P1-B: gerbang kapabilitas di gerbang konfirmasi (propose + claim). P1-C: klaim HANYA via tombol (executeDirectConfirmation); kirim-ulang teks tidak mengeksekusi. P1-E: jejak mutation-log. Fast Track Continuation A2: slot terikat aktor pengusul (demo-role — bukan identitas server, lihat batas WC-06).',
    })),
  {
    key: 'DELETE_PROJECT_CONFIRM', kind: 'intent', classification: 'PERSISTENT_MUTATION', scope: 'project',
    capability: 'edit-estimate', confirmation: 'two-step', audit: 'mutation-log', gatedInP1: true,
    notes: 'Langkah 2 hapus (hanya dari tombol; tanpa pola router). P1-B: gerbang kapabilitas di case registry. P1-E: jejak mutation-log. Fast Track Continuation A2: langkah 1 mengusulkan slot konfirmasi (sidik id+nama + TTL 10 mnt + sekali pakai + aktor) — konfirmasi tanpa slot yang sah ditolak.',
  },
  {
    key: 'SET_PROJECT_PRICE_CONFIRM', kind: 'intent', classification: 'PERSISTENT_MUTATION', scope: 'project',
    capability: 'edit-estimate', confirmation: 'two-step', audit: 'mutation-log', gatedInP1: true,
    notes: 'Override harga satu proyek (payload pratinjau terikat). P1-B: gerbang kapabilitas di case registry. P1-E: jejak mutation-log. Fast Track Continuation A2: langkah 1 mengusulkan slot konfirmasi (sidik = payload JSON persis + TTL 10 mnt + sekali pakai + aktor) — konfirmasi tanpa slot yang sah ditolak.',
  },
  {
    key: 'CREATE_REVISION', kind: 'intent', classification: 'PERSISTENT_MUTATION', scope: 'project',
    capability: 'edit-estimate', confirmation: 'direct-command', audit: 'mutation-log', gatedInP1: true,
    notes: 'P1: SEBELUMNYA tanpa konfirmasi dan tanpa gerbang sama sekali (eksekusi langsung). Kini lewat gerbang perintah langsung (tanya → tombol konfirmasi) + gerbang kapabilitas + jejak mutation-log.',
  },
  // ---- Tool model-callable (EZRAB_AI_TOOLS) --------------------------
  ...READ_ONLY_TOOLS.map((key): MutationInventoryEntry => ({
    key, kind: 'tool', classification: 'READ_ONLY', scope: 'none',
    capability: null, confirmation: 'none', audit: 'tool-trail', gatedInP1: false,
    notes: 'Model-callable (di EZRAB_AI_TOOLS). Baca saja.',
  })),
  ...(['propose_update_quantity', 'propose_update_unit_price', 'propose_delete_items',
      'propose_add_item', 'propose_undo_last'] as const)
    .map((key): MutationInventoryEntry => ({
      key, kind: 'tool', classification: 'PERSISTENT_MUTATION', scope: 'project',
      capability: 'edit-estimate', confirmation: 'change-plan', audit: 'op-log', gatedInP1: true,
      notes: 'Model HANYA mengusulkan (membangun ChangePlan); eksekusi butuh tombol Konfirmasi manusia. Pre-check writesEnabled pra-P1, dipertahankan.',
    })),
  // ---- Tool native registry (BUKAN model-callable sesudah WC-03) -----
  {
    key: 'build_universal_draft', kind: 'tool', classification: 'SIMULATION_ONLY', scope: 'draft',
    capability: null, confirmation: 'none', audit: 'tool-trail', gatedInP1: true,
    notes: 'WC-03: TIDAK ada di EZRAB_AI_TOOLS — model TIDAK BOLEH memanggilnya (allowlist di executeTool, actor model ditolak). Tetap dapat dipanggil orkestrator/user (generate-draft). Membangun draft saja; TIDAK menulis ke proyek. Hook F-ISO-4-nya direvisi §4.5: mengikat ke proyek yang ADA saja, tidak pernah membuat proyek.',
  },
  ...READ_ONLY_NATIVE_TOOLS.map((key): MutationInventoryEntry => ({
    key, kind: 'tool', classification: 'READ_ONLY', scope: 'none',
    capability: null, confirmation: 'none', audit: 'tool-trail', gatedInP1: true,
    notes: 'Native registry (bukan EZRAB_AI_TOOLS): tidak model-callable di kanal chat-ai sesudah allowlist WC-03; TETAPI kedelapannya ADA di COPILOT_ALLOWED_TOOLS (diiklankan ke model Copilot) sehingga model-callable di kanal copilot. Orkestrator/sistem tetap boleh di semua kanal.',
  })),
  {
    key: 'transfer_draft', kind: 'tool', classification: 'READ_ONLY', scope: 'none',
    capability: null, confirmation: 'none', audit: 'tool-trail', gatedInP1: true,
    notes: 'HANYA memeriksa kesiapan + mencatat persetujuan (delegated-ui); TIDAK PERNAH menulis item RAB — penulisan tetap lewat tombol push. Permission consequential: butuh approval actor user (APPROVAL_REQUIRED tanpa itu). Bukan model-callable sesudah WC-03.',
  },
  ...(['wizard_server', 'llm_memory_extraction', 'resume_server_execution', 'present_questionnaire'] as const)
    .map((key): MutationInventoryEntry => ({
      key, kind: 'tool', classification: 'READ_ONLY', scope: 'none',
      capability: null, confirmation: 'none', audit: 'tool-trail', gatedInP1: false,
      notes: 'Terdaftar available:false — pemanggilan apa pun DIBLOKIR (TOOL_UNAVAILABLE). Bukan permukaan mutasi.',
    })),
  // ---- Aksi UI: push (P1-B) ------------------------------------------
  {
    key: 'PUSH_UNIVERSAL', kind: 'ui-action', classification: 'PERSISTENT_MUTATION', scope: 'project',
    capability: 'edit-estimate', confirmation: 'transfer-binding', audit: 'transfer-receipt', gatedInP1: true,
    notes: 'Transfer draft universal ke Spreadsheet RAB (tombol Konfirmasi Transfer). P1-B: gerbang kapabilitas di pratinjau + konfirmasi. §4.5: draft tak-terikat → konfirmasi transfer sekaligus mengonfirmasi pembuatan proyek (baru dibuat di titik itu). Jejak: transfer receipt + mutation-log.',
  },
  {
    key: 'PUSH_DIRECT_RAB', kind: 'ui-action', classification: 'PERSISTENT_MUTATION', scope: 'project',
    capability: 'edit-estimate', confirmation: 'transfer-binding', audit: 'mutation-log', gatedInP1: true,
    notes: 'Push hasil RAB langsung (tombol Konfirmasi Push). P1-B: gerbang kapabilitas di pratinjau + konfirmasi. §4.5: sama seperti PUSH_UNIVERSAL (pembuatan proyek hanya sesudah konfirmasi).',
  },
  {
    key: 'PUSH_ANSWER_ITEMS', kind: 'ui-action', classification: 'PERSISTENT_MUTATION', scope: 'project',
    capability: 'edit-estimate', confirmation: 'direct-command', audit: 'mutation-log', gatedInP1: true,
    notes: '"Tambah ke Spreadsheet" dari jawaban AHSP (item teratas saja). P1-B: gerbang kapabilitas di handler. Fast Track §3 (P1-04/P1-05): pratinjau terikat ditambahkan — klik pertama menampilkan nilai yang akan ditulis + mengusulkan slot konfirmasi (sidik + TTL 10 mnt + sekali pakai, infrastruktur perintah langsung yang sama); konfirmasi mengklaim slot dengan sidik yang direkomputasi segar. Referensi konfirmasi record audit = sidik pratinjau yang diklaim.',
  },
  // ---- Aksi UI: finalize DED (P1-B) ----------------------------------
  {
    key: 'DED_FINALIZE', kind: 'ui-action', classification: 'PERSISTENT_MUTATION', scope: 'project',
    capability: 'edit-estimate', confirmation: 'finalize-click', audit: 'mutation-log', gatedInP1: true,
    notes: 'Finalize DED standar (validate-before-insert + klik Finalize; membuat proyek bila belum ada target — klik Finalize adalah konfirmasi pembuatan itu). P1-B: gerbang kapabilitas di handler.',
  },
  {
    key: 'DED_FINALIZE_FULL_AI', kind: 'ui-action', classification: 'PERSISTENT_MUTATION', scope: 'project',
    capability: 'edit-estimate', confirmation: 'finalize-click', audit: 'mutation-log', gatedInP1: true,
    notes: 'Finalize DED Full AI — sama seperti DED_FINALIZE.',
  },
  // ---- Aksi UI: cakupan draft (PERSISTENT_MUTATION draft; DIGERBANG Fast Track §7) --
  {
    key: 'FULL_AI_COMPLETE', kind: 'ui-action', classification: 'PERSISTENT_MUTATION', scope: 'draft',
    capability: 'edit-estimate', confirmation: 'button-only', audit: 'none', gatedInP1: true,
    notes: 'H-12: "Lengkapi dengan Full AI" mengisi draft + autosave (Fast Track: completion ditahan sebagai pratinjau; persist HANYA sesudah "Terima lengkapan"). Cakupan DRAFT — P1 tidak menggerbang (menunggu keputusan owner); Fast Track §7 (2026-11-24) MEMUTUSKAN cakupan draft juga butuh Admin: gerbang di pemicu (tombol + trigger teks), di "Terima lengkapan", dan di "Batalkan lengkapan" (restore + autosave = tulis persisten). "Buang lengkapan" tidak digerbang (hanya membuang klon tertunda di memori). Fast Track Continuation A2: pratinjau lengkapan bertenggat 10 menit + terima menolak bila draft live berubah sesudah proposal (sidik isi). gatedInP1=true menandai gerbang memakai mekanisme P1-B — gerbangnya sendiri mendarat di Fast Track, bukan P1.',
  },
  {
    key: 'REVISION_ACTIVATE', kind: 'ui-action', classification: 'PERSISTENT_MUTATION', scope: 'draft',
    capability: 'edit-estimate', confirmation: 'button-only', audit: 'draft-versions', gatedInP1: true,
    notes: 'Gate 3: aktivasi pratinjau revisi (cakupan draft; ACCEPTABLE per audit). Tombol saja. Fast Track §7: DIGERBANG di runRevisionActivation (satu choke point: tombol + afirmasi teks + panel). Pembatalan revisi tidak digerbang (hanya membuang pratinjau memori). gatedInP1=true menandai mekanisme P1-B; gerbangnya mendarat di Fast Track.',
  },
  {
    key: 'QTO_CORRECTION', kind: 'ui-action', classification: 'PERSISTENT_MUTATION', scope: 'draft',
    capability: 'edit-estimate', confirmation: 'button-only', audit: 'draft-versions', gatedInP1: true,
    notes: 'Gate 4: terima/tolak koreksi QTO (cakupan draft; SOUND per audit — teks afirmasi eksplisit TIDAK diterima). Fast Track §7: DIGERBANG (terima DAN tolak — keduanya mempersistenkan keputusan lewat saveDedAttachment). gatedInP1=true menandai mekanisme P1-B; gerbangnya mendarat di Fast Track.',
  },
  {
    key: 'DED_SPEC_REVISION', kind: 'ui-action', classification: 'PERSISTENT_MUTATION', scope: 'draft',
    capability: 'edit-estimate', confirmation: 'button-only', audit: 'draft-versions', gatedInP1: true,
    notes: 'Gate 4: revisi spek DED (cakupan draft; preview-id-bound, sekali pakai). Fast Track §7: DIGERBANG pada KONFIRMASI saja (restoreUniversalContext = tulis persisten; penolakan digerbang → pratinjau TETAP menunggu agar Admin masih bisa memutuskan). Pembatalan (reject) tidak digerbang — tidak menulis apa pun yang persisten. gatedInP1=true menandai mekanisme P1-B; gerbangnya mendarat di Fast Track.',
  },
];

const INVENTORY_MAP = new Map<string, MutationInventoryEntry>(
  MUTATION_INVENTORY.map((e) => [e.key, e]),
);

/** Cari entri inventaris berdasarkan kunci (intent / tool / aksi UI). */
export function getMutationInventoryEntry(key: string): MutationInventoryEntry | undefined {
  return INVENTORY_MAP.get(key);
}

/**
 * Penolakan non-admin — KALIMAT PERSIS owner (directive §4.2, P1-B).
 * Jangan diubah tanpa persetujuan owner: teks ini dipin tes D6 N-7.
 */
export const CHAT_AI_ADMIN_ONLY_MESSAGE =
  'Maaf, perubahan data melalui Chat AI hanya dapat dilakukan oleh Admin. ' +
  'Saya tetap dapat membantu membuat simulasi atau analisis tanpa menyimpan perubahan.';

export type ChatAiAuthorization =
  | { ok: true }
  | { ok: false; reason: 'UNKNOWN_KEY' | 'CAPABILITY_REQUIRED'; message: string };

/**
 * SATU-SATUNYA pemeriksaan kapabilitas mutasi Chat AI (P1-B, WC-01).
 *
 * Dipakai SEMUA batas mutasi: gerbang perintah langsung (actionRegistry),
 * handler push (view.tsx), finalize DED (ded-ai-estimate/view.tsx).
 *
 * Aturan (berurutan):
 *  1. Kunci tidak ada di inventaris → TOLAK (fail-closed).
 *  2. Klasifikasi READ_ONLY / SIMULATION_ONLY → IZINKAN (tanpa capability).
 *  3. PERSISTENT_MUTATION tanpa capability terdaftar → IZINKAN.
 *     (Tidak ada entri saat ini yang mengandalkan aturan ini — sejak
 *     Fast Track §7, SEMUA entri PERSISTENT_MUTATION membawa
 *     capability. Aturan ini dipertahankan sebagai jaring pengaman
 *     klasifikasi, bukan sebagai pengecualian yang aktif.)
 *  4. PERSISTENT_MUTATION dengan capability → izinkan HANYA bila
 *     `writesEnabled === true`. Nilai null/undefined/false (identitas /
 *     otorisasi tidak dapat ditegakkan) → TOLAK dengan kalimat owner.
 *
 * `writesEnabled` dipasok pemanggil dari sumbernya masing-masing:
 * Chat AI → `getAssistantOperationContext()?.writesEnabled` (berasal dari
 * `hasCapability('edit-estimate')` view); DED → `hasCapability('edit-estimate')`
 * langsung (view DED tidak memasang konteks operasi asisten).
 *
 * KEJUJURAN (WC-06): nilai ini berasal dari sesi peran DEMO klien yang
 * dapat dipalsukan — gerbang ini UX-ONLY sampai peran server mendarat.
 * Lihat header modul ini.
 */
export function authorizeChatAiMutation(
  key: string,
  writesEnabled: boolean | null | undefined,
): ChatAiAuthorization {
  const entry = INVENTORY_MAP.get(key);
  if (!entry) {
    return {
      ok: false,
      reason: 'UNKNOWN_KEY',
      message:
        `Mutasi "${key}" tidak dikenal di inventaris otorisasi Chat AI — ditolak secara default (fail-closed). ` +
        'Permukaan mutasi baru wajib didaftarkan dulu di mutationInventory.ts.',
    };
  }
  if (entry.classification !== 'PERSISTENT_MUTATION') return { ok: true };
  if (!entry.capability) return { ok: true };
  if (writesEnabled === true) return { ok: true };
  return { ok: false, reason: 'CAPABILITY_REQUIRED', message: CHAT_AI_ADMIN_ONLY_MESSAGE };
}

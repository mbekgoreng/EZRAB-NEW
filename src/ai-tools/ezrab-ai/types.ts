/**
 * EZRAB AI — Types (src/ai-tools/ezrab-ai/types.ts)
 * Standalone assistant/chat product with its own system prompt, tooling contract,
 * and structured error handling. NOT the DED vision pipeline.
 */

export interface EzrabAiMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  toolName?: string;
  toolStatus?: 'ok' | 'error';
}

export interface EzrabAiToolCall {
  toolName: string;
  args: Record<string, unknown>;
}

export interface EzrabAiToolResult {
  toolName: string;
  ok: boolean;
  output: string;
}

export interface EzrabAiRequest {
  sessionId?: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  projectSummary?: string;
  /** Structured active-project snapshot (drives read-only project tools). */
  projectSnapshot?: import('./projectContext').ProjectSnapshot | null;
  mode?: 'fast' | 'advanced';
  /** Scope kanonis Fase 1 — builder menolak snapshot lintas proyek. */
  projectId?: string;
  conversationId?: string;
  /** userId bila ada; null bila pemanggil tidak mengisinya — service mengisi
   *  dari identitas sesi terverifikasi (konteks akun Fase B) bila ada. */
  userId?: string | null;
  /** Konteks intake kanonis proyek (state terstruktur — sumber fakta). */
  intakeContext?: import('./universalIntake').UniversalIntakeContext | null;
  /** Spek RAB jalur rumah per pesan (W11 builder + wiring koordinator §11):
   *  diekstrak pemanggil dari teks pesan via extractRabIntentSpec; builder
   *  hanya memformat field yang terisi (null/[] = UNKNOWN, tidak dikarang). */
  rabIntentSpec?: import('./rabIntentSpec').RabIntentSpec | null;
  /** Spek terstruktur v2 (bila tidak ikut intakeContext). */
  structuredSpecs?: import('./structuredSpec').StructuredSpec[] | null;
  /** Ringkasan draft aktif proyek (judul/versi/jumlah — bukan isi penuh). */
  draftSummary?: import('./canonicalContext').CanonicalDraftSummary | null;
  /** Ringkasan percakapan tersimpan per conversationId (dari store). */
  storedSummary?: import('./conversationSummary').ConversationSummary | null;
  /**
   * FASE 2 — seksi MEMORI terstruktur (sudah diformat + di-retrieval
   * lewat memory.ts). Null = tidak ada memori / personalisasi nonaktif.
   */
  memorySection?: string | null;
  /** Laporan retrieval memori pemanggil (observabilitas per lapis). */
  memoryReport?: import('./canonicalContext').CanonicalContextReport['retrieval']['memory'];
  /**
   * FASE 3 — seksi OBJEKTIF TUGAS (sudah diformat oleh
   * agentOrchestrator.formatObjectiveSection). Null = tanpa objektif.
   */
  objectiveSection?: string | null;
  /**
   * FASE 5 — seksi PEMAHAMAN DED (sudah diformat oleh
   * dedUnderstanding.buildDedSection) dan PEMERIKSAAN QTO (sudah
   * diformat oleh qtoBridge.buildQtoSection). Null = tanpa hasil
   * DED/QTO yang di-wire ke permintaan ini. Builder hanya menempelkan
   * dengan cap sendiri, di dalam blok DATA.
   */
  dedSection?: string | null;
  qtoSection?: string | null;
  /**
   * FASE B (Full Account Intelligence) — seksi AKUN & LANGGANAN yang
   * sudah diformat pemanggil (accountContext.formatAccountSection).
   * Bila diisi, service TIDAK memanggil endpoint account-context (hemat
   * satu HTTP round-trip; dipakai tes + pemanggil yang sudah punya
   * snapshot). Bila kosong, service mengambilnya sendiri dari sesi
   * Supabase sebelum send() — tanpa sesi = tanpa seksi.
   */
  accountSection?: string | null;
  /** Kunci idempotensi operasi kirim ini. Bila kosong, service membuat
   *  satu kunci acak baru untuk operasi ini; percobaan ulang operasi yang
   *  sama meneruskan kunci yang sama. */
  idempotencyKey?: string;
  /** FINAL HARDENING §8 (2026-11-11): AbortSignal milik pemanggil (view),
   *  diteruskan apa adanya ke aiToolsProviderClient.execute — service
   *  tidak membuat controller sendiri untuk sinyal ini. */
  signal?: AbortSignal;
}

export interface EzrabAiResponse {
  success: boolean;
  reply: string;
  rawContent: string;
  requestId: string;
  /** Machine-readable failure kind on success=false (e.g. AUTH_REQUIRED,
   *  DEMO_RESTRICTED, MODEL_ERROR) so the UI can react honestly. */
  errorCode?: string;
  toolCalls?: EzrabAiToolCall[];
  toolResults?: EzrabAiToolResult[];
  /**
   * D-50 (perbaikan verifikasi live 2026-11-16): saran langkah lanjutan
   * kontekstual yang ditempel service dari pesan pengguna terakhir +
   * balasan final — balasan gateway live tidak pernah mengirimnya.
   * Isinya label kontrak Quick Action (mis. 'Hitung Volume'), BUKAN
   * token routing internal. Undefined = konteks tanpa saran (perilaku
   * lama dipertahankan); cabang gagal tidak pernah membawa saran.
   */
  followUpSuggestions?: string[];
  /** D3 (2026-11-26): aksi lanjutan yang dilampirkan service bila reply
   *  adalah balasan aman atas kegagalan scope proyek (PROJECT_SCOPE_*).
   *  Bentuk intent-only agar tidak ada siklus impor ke actionRegistry. */
  actions?: Array<{ label: string; action: { kind: 'intent'; intent: string; param?: string } }>;
}

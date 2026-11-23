/**
 * EZRAB PROJECT COPILOT — UNIFIED CONVERSATION STORE
 * 
 * Canonical reactive session store for all AI Copilot surfaces (Floating CoAssistant & Magic AI SuperView).
 * Resolves F-02 (Session Asynchrony) by guaranteeing both interfaces share a single source of truth.
 * 
 * Key Principles:
 * 1. Strict Project Isolation: Conversation belonging to Project A can NEVER be accessed with Project B context.
 * 2. Fail-Closed Security: Mismatched or missing projectId throws ProjectIsolationError.
 * 3. Reactive Event Bus: Dispatches real-time events for message streaming, tools, proposals, and approvals.
 * 4. Backward Compatibility: Transparently migrates and synchronizes legacy Magic AI sessions.
 */

import { ProjectIsolationError } from '../../unifiedProjectContext';
import { safeSetJSON, type StorageResult } from '../../../utils/safeStorage';
import { onExternalStorageChange } from '../../../engine/storage/hardenedStorage';
import {
  buildExtractiveSummary,
  type ConversationSummary,
} from '../../../ai-tools/ezrab-ai/conversationSummary';
import { deleteMemoriesForConversation } from '../../../ai-tools/ezrab-ai/memory';
import type {
  AIConversation,
  AIMessage,
  AIConversationEvent,
  AIConversationListener,
} from './conversationTypes';

const UNIFIED_CONVERSATIONS_KEY = 'ezrab_unified_conversations_v2';
const ACTIVE_CONVERSATION_PREFIX = 'ezrab_active_conversation_v2_';
const LEGACY_SESSIONS_STORAGE_KEY = 'ezrab_magic_ai_sessions_v1';
/**
 * WP02-DEFECT-1 (2026-11-24) — tombstone penghapusan percakapan.
 * Peta `{ conversationId: deletedAtMs }`. Tombstone HARUS tersimpan di
 * storage (bukan hanya in-memory): tombstone sesi-saja tidak dapat
 * menghentikan tab LAIN yang masih memegang salinan basi untuk
 * membangkitkan percakapan yang dihapus pada simpan berikutnya.
 * Salinan dengan updatedAt <= tombstone dianggap mati; salinan dengan
 * updatedAt > tombstone adalah aktivitas eksplisit yang lebih baru
 * daripada hapusan dan menggantikan tombstone (fail-closed: pesan baru
 * tidak boleh hilang karena hapusan lama). Entri dipangkas sesudah
 * 30 hari — tab yang basi lebih lama dari itu dapat membangkitkan
 * kembali percakapan yang dihapus (batas yang didokumentasikan).
 */
const DELETED_CONVERSATIONS_KEY = 'ezrab_unified_conversations_v2_deleted';
const TOMBSTONE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export class UnifiedConversationStore {
  private static instance: UnifiedConversationStore | null = null;
  private conversations: Map<string, AIConversation> = new Map();
  private activeConversationByProject: Map<string, string> = new Map();
  private listeners: Set<AIConversationListener> = new Set();
  private initialized = false;
  /**
   * NEW-02 (Batch E): hasil tulis storage TERAKHIR. `saveToStorage`
   * tidak pernah melempar (gagal tulis hanya di-warn), sehingga
   * pemanggil tidak dapat membedakan "tersimpan" dari "gagal simpan"
   * tanpa kanal ini. null = belum ada upaya tulis di lingkungan ini
   * (mis. non-browser) — BUKAN kegagalan.
   */
  private lastSaveResult: StorageResult | null = null;
  /**
   * WP02-DEFECT-1 — tombstone sesi-ini (cermin in-memory dari
   * DELETED_CONVERSATIONS_KEY; merge memakai gabungan keduanya).
   */
  private deletedAt: Map<string, number> = new Map();
  /**
   * WP02-DEFECT-1 — penanda clearMessages sesi-ini
   * (`conversationId` -> updatedAt saat pesan dikosongkan). Tanpa ini,
   * union pesan pada merge akan membangkitkan pesan yang sengaja
   * dikosongkan bila salinan storage pra-clear muncul kembali
   * (simpan clear gagal / tab basi). Hanya sesi-ini: clearMessages
   * tidak punya pemanggil produksi lintas-tab, dan simpan clear yang
   * sukses sudah menulis versi kosong ke storage.
   */
  private clearedAt: Map<string, number> = new Map();
  /** WP02-DEFECT-1 — handle unsubscribe langganan storage lintas-tab. */
  private unsubscribeExternal: (() => void) | null = null;

  private constructor() {
    this.loadFromStorage();
    // WP02-DEFECT-1: langganan perubahan storage lintas-tab (pola S3-A
    // yang sama dengan view.tsx / ProjectContext) — tab yang tidak
    // menulis tetap me-refresh peta in-memory-nya. Best-effort:
    // kegagalan langganan TIDAK PERNAH menggagalkan konstruksi store
    // (lingkungan non-browser / shim tes tanpa addEventListener).
    try {
      this.unsubscribeExternal = onExternalStorageChange((ev) => {
        if (ev.key === UNIFIED_CONVERSATIONS_KEY) this.refreshFromStorage();
      });
    } catch {
      this.unsubscribeExternal = null;
    }
  }

  public static getInstance(): UnifiedConversationStore {
    if (!UnifiedConversationStore.instance) {
      UnifiedConversationStore.instance = new UnifiedConversationStore();
    }
    return UnifiedConversationStore.instance;
  }

  /**
   * Reset store (useful for automated testing)
   */
  public static resetInstance(): void {
    if (UnifiedConversationStore.instance) {
      UnifiedConversationStore.instance.conversations.clear();
      UnifiedConversationStore.instance.activeConversationByProject.clear();
      UnifiedConversationStore.instance.listeners.clear();
      UnifiedConversationStore.instance.deletedAt.clear();
      UnifiedConversationStore.instance.clearedAt.clear();
      try {
        UnifiedConversationStore.instance.unsubscribeExternal?.();
      } catch {}
      UnifiedConversationStore.instance.unsubscribeExternal = null;
      UnifiedConversationStore.instance.initialized = false;
    }
    UnifiedConversationStore.instance = null;
  }

  // ===========================================================================
  // SUBSCRIPTION / EVENT BUS
  // ===========================================================================

  public subscribe(listener: AIConversationListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: AIConversationEvent): void {
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (err) {
        console.error('[UnifiedConversationStore] Listener execution error:', err);
      }
    });
  }

  // ===========================================================================
  // VALIDATION & ISOLATION
  // ===========================================================================

  private validateProjectId(projectId: string | null | undefined): string {
    if (!projectId || typeof projectId !== 'string' || !projectId.trim()) {
      throw new ProjectIsolationError('PROJECT_ISOLATION_ERROR: Operation requires a valid, non-empty projectId.');
    }
    return projectId.trim();
  }

  // ===========================================================================
  // CONVERSATION LIFECYCLE
  // ===========================================================================

  public getConversation(conversationId: string, projectId: string): AIConversation | null {
    const validProjectId = this.validateProjectId(projectId);
    const conv = this.conversations.get(conversationId);
    if (!conv) return null;

    if (conv.projectId !== validProjectId) {
      throw new ProjectIsolationError(
        `PROJECT_ISOLATION_ERROR: Cannot access conversation ${conversationId} belonging to project ${conv.projectId} from project context ${validProjectId}.`
      );
    }
    return { ...conv, messages: [...conv.messages] };
  }

  public listConversations(projectId: string): AIConversation[] {
    const validProjectId = this.validateProjectId(projectId);
    return Array.from(this.conversations.values())
      .filter((c) => c.projectId === validProjectId)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((c) => ({ ...c, messages: [...c.messages] }));
  }

  public getOrCreateActiveConversation(projectId: string, initialTitle?: string): AIConversation {
    const validProjectId = this.validateProjectId(projectId);
    
    // Check if there is an active conversation ID for this project
    const activeId = this.getActiveConversationId(validProjectId);
    if (activeId) {
      const existing = this.getConversation(activeId, validProjectId);
      if (existing) {
        return existing;
      }
    }

    // Check if there is any conversation for this project
    const projectConversations = this.listConversations(validProjectId);
    if (projectConversations.length > 0) {
      const latest = projectConversations[0];
      this.setActiveConversationId(validProjectId, latest.id);
      return latest;
    }

    // Otherwise create a fresh conversation
    return this.createConversation(validProjectId, initialTitle || 'Percakapan Copilot');
  }

  public createConversation(
    projectId: string,
    title: string = 'Percakapan Proyek Baru',
    organizationId?: string
  ): AIConversation {
    const validProjectId = this.validateProjectId(projectId);
    const now = Date.now();
    const id = `conv-${validProjectId}-${now}-${Math.random().toString(36).slice(2, 7)}`;

    const newConv: AIConversation = {
      id,
      projectId: validProjectId,
      organizationId,
      title,
      messages: [],
      createdAt: now,
      updatedAt: now,
    };

    this.conversations.set(id, newConv);
    this.setActiveConversationId(validProjectId, id);
    this.saveToStorage();

    this.emit({
      type: 'CONVERSATION_CREATED',
      conversationId: id,
      projectId: validProjectId,
      payload: newConv,
      timestamp: new Date().toISOString(),
    });

    return { ...newConv };
  }

  public updateConversationTitle(conversationId: string, projectId: string, title: string): AIConversation {
    const validProjectId = this.validateProjectId(projectId);
    const conv = this.conversations.get(conversationId);
    if (!conv) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }
    if (conv.projectId !== validProjectId) {
      throw new ProjectIsolationError(`PROJECT_ISOLATION_ERROR: Mismatched project ${validProjectId} for conversation ${conversationId}.`);
    }

    conv.title = title.trim() || conv.title;
    conv.updatedAt = Date.now();
    this.saveToStorage();

    this.emit({
      type: 'CONVERSATION_UPDATED',
      conversationId,
      projectId: validProjectId,
      payload: { title: conv.title },
      timestamp: new Date().toISOString(),
    });

    return { ...conv };
  }

  public deleteConversation(conversationId: string, projectId: string): boolean {
    const validProjectId = this.validateProjectId(projectId);
    const conv = this.conversations.get(conversationId);
    if (!conv) return false;

    if (conv.projectId !== validProjectId) {
      throw new ProjectIsolationError(`PROJECT_ISOLATION_ERROR: Cannot delete conversation of different project.`);
    }

    this.conversations.delete(conversationId);
    // WP02-DEFECT-1: catat tombstone SEBELUM simpan — merge
    // (tab ini maupun tab lain) tidak boleh membangkitkan percakapan
    // ini dari salinan basi. Tombstone ditulis dulu agar hapusan
    // bertahan walau simpan peta sesudahnya gagal.
    this.deletedAt.set(conversationId, Date.now());
    this.clearedAt.delete(conversationId);
    this.persistTombstones();
    // FASE 2 — penghapusan menyebar ke memori: memori percakapan dari
    // conversationId ini dihapus dari store memori (bukan hanya dari
    // daftar percakapan) agar tidak muncul lagi lewat retrieval.
    try {
      deleteMemoriesForConversation(conversationId, validProjectId, null);
    } catch {
      /* purge memori tidak boleh menggagalkan hapus percakapan */
    }
    if (this.activeConversationByProject.get(validProjectId) === conversationId) {
      this.activeConversationByProject.delete(validProjectId);
      try {
        if (typeof window !== 'undefined') {
          localStorage.removeItem(`${ACTIVE_CONVERSATION_PREFIX}${validProjectId}`);
        }
      } catch {}
    }
    this.saveToStorage();

    this.emit({
      type: 'CONVERSATION_DELETED',
      conversationId,
      projectId: validProjectId,
      timestamp: new Date().toISOString(),
    });

    return true;
  }

  public getActiveConversationId(projectId: string): string | null {
    const validProjectId = this.validateProjectId(projectId);
    const inMemory = this.activeConversationByProject.get(validProjectId);
    if (inMemory) return inMemory;

    try {
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem(`${ACTIVE_CONVERSATION_PREFIX}${validProjectId}`);
        if (stored) {
          this.activeConversationByProject.set(validProjectId, stored);
          return stored;
        }
      }
    } catch {}

    return null;
  }

  public setActiveConversationId(projectId: string, conversationId: string): void {
    const validProjectId = this.validateProjectId(projectId);
    const conv = this.conversations.get(conversationId);
    if (conv && conv.projectId !== validProjectId) {
      throw new ProjectIsolationError(
        `PROJECT_ISOLATION_ERROR: Cannot set active conversation of project ${conv.projectId} to context project ${validProjectId}.`
      );
    }

    this.activeConversationByProject.set(validProjectId, conversationId);
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(`${ACTIVE_CONVERSATION_PREFIX}${validProjectId}`, conversationId);
      }
    } catch {}

    this.emit({
      type: 'CONVERSATION_SWITCHED',
      conversationId,
      projectId: validProjectId,
      timestamp: new Date().toISOString(),
    });
  }

  // ===========================================================================
  // MESSAGE MANAGEMENT
  // ===========================================================================

  public appendMessage(
    conversationId: string,
    projectId: string,
    message: Omit<AIMessage, 'id' | 'conversationId' | 'projectId' | 'createdAt' | 'timestamp'> & {
      id?: string;
      createdAt?: string;
      timestamp?: string;
    }
  ): AIMessage {
    const validProjectId = this.validateProjectId(projectId);
    let conv = this.conversations.get(conversationId);

    if (!conv) {
      // Create if it doesn't exist
      conv = this.createConversation(validProjectId, 'Percakapan Copilot');
      conversationId = conv.id;
    }

    if (conv.projectId !== validProjectId) {
      throw new ProjectIsolationError(
        `PROJECT_ISOLATION_ERROR: Message target conversation ${conversationId} belongs to ${conv.projectId}, not ${validProjectId}.`
      );
    }

    const now = new Date();
    const formattedTime = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

    const newMsg: AIMessage = {
      id: message.id || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      conversationId,
      projectId: validProjectId,
      role: message.role,
      content: message.content,
      badge: message.badge,
      toolCalls: message.toolCalls,
      toolResults: message.toolResults,
      actionProposal: message.actionProposal,
      table: message.table,
      stats: message.stats,
      wizardResponse: message.wizardResponse,
      quickActionResponse: message.quickActionResponse,
      followUpSuggestions: message.followUpSuggestions,
      status: message.status || 'completed',
      isError: message.isError,
      intent: message.intent,
      createdAt: message.createdAt || now.toISOString(),
      timestamp: message.timestamp || formattedTime,
    };

    conv.messages.push(newMsg);
    conv.updatedAt = Date.now();
    // FASE 1 — ringkasan percakapan: diperbarui deterministik saat
    // percakapan memanjang (≥12 pesan, tiap kelipatan 5) agar builder
    // kanonis dapat menggantikan riwayat mentah panjang dengan ringkasan
    // tanpa kehilangan fakta proyek (fakta datang dari state terstruktur).
    if (conv.messages.length >= 12 && conv.messages.length % 5 === 0) {
      try {
        conv.summary = buildExtractiveSummary(
          conv.messages.map((m) => ({ role: m.role, content: m.content })),
        );
      } catch {
        /* ringkasan gagal ≠ pesan gagal tersimpan */
      }
    }
    this.saveToStorage();

    this.emit({
      type: 'MESSAGE_CREATED',
      conversationId,
      projectId: validProjectId,
      messageId: newMsg.id,
      payload: newMsg,
      timestamp: now.toISOString(),
    });

    return { ...newMsg };
  }

  /**
   * FASE 1 — Ringkasan percakapan tersimpan (per conversationId).
   * Mengembalikan ringkasan bila ada, null bila belum dibuat.
   */
  public getConversationSummary(conversationId: string, projectId: string): ConversationSummary | null {
    const validProjectId = this.validateProjectId(projectId);
    const conv = this.conversations.get(conversationId);
    if (!conv || conv.projectId !== validProjectId) return null;
    return conv.summary ?? null;
  }

  /**
   * FASE 1 — Hitung ulang ringkasan ekstraktif dari pesan kini dan
   * simpan bersama percakapan. Deterministik; tidak memakai LLM.
   */
  public refreshConversationSummary(conversationId: string, projectId: string): ConversationSummary | null {
    const validProjectId = this.validateProjectId(projectId);
    const conv = this.conversations.get(conversationId);
    if (!conv || conv.projectId !== validProjectId) return null;
    conv.summary = buildExtractiveSummary(
      conv.messages.map((m) => ({ role: m.role, content: m.content })),
    );
    conv.updatedAt = Date.now();
    this.saveToStorage();
    return { ...conv.summary };
  }

  public updateMessage(
    conversationId: string,
    projectId: string,
    messageId: string,
    updates: Partial<Omit<AIMessage, 'id' | 'conversationId' | 'projectId'>>
  ): AIMessage {
    const validProjectId = this.validateProjectId(projectId);
    const conv = this.conversations.get(conversationId);
    if (!conv) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    if (conv.projectId !== validProjectId) {
      throw new ProjectIsolationError(`PROJECT_ISOLATION_ERROR: Mismatched project for updateMessage.`);
    }

    const msgIndex = conv.messages.findIndex((m) => m.id === messageId);
    if (msgIndex === -1) {
      throw new Error(`Message ${messageId} not found in conversation ${conversationId}.`);
    }

    const updated = {
      ...conv.messages[msgIndex],
      ...updates,
    };
    conv.messages[msgIndex] = updated;
    conv.updatedAt = Date.now();
    this.saveToStorage();

    this.emit({
      type: updates.status === 'streaming' ? 'MESSAGE_STREAMING' : 'MESSAGE_UPDATED',
      conversationId,
      projectId: validProjectId,
      messageId,
      payload: updated,
      timestamp: new Date().toISOString(),
    });

    return { ...updated };
  }

  public clearMessages(conversationId: string, projectId: string): void {
    const validProjectId = this.validateProjectId(projectId);
    const conv = this.conversations.get(conversationId);
    if (!conv) return;

    if (conv.projectId !== validProjectId) {
      throw new ProjectIsolationError(`PROJECT_ISOLATION_ERROR: Cannot clear messages of another project.`);
    }

    conv.messages = [];
    conv.summary = undefined; // ringkasan mengikuti pesan — pesan habis = ringkasan basi
    // FASE 2 — pesan habis ⇒ memori percakapan turunan pesan ikut dihapus.
    try {
      deleteMemoriesForConversation(conversationId, validProjectId, null);
    } catch {
      /* purge memori tidak boleh menggagalkan hapus pesan */
    }
    conv.updatedAt = Date.now();
    // WP02-DEFECT-1: tandai clear sesi-ini agar merge tidak
    // membangkitkan pesan pra-clear dari salinan storage basi.
    this.clearedAt.set(conversationId, conv.updatedAt);
    this.saveToStorage();

    this.emit({
      type: 'CONVERSATION_UPDATED',
      conversationId,
      projectId: validProjectId,
      payload: { messages: [] },
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * NEW-02 (Batch E): hasil tulis storage terakhir — dibaca pemanggil
   * tepat sesudah mutasi (append/update) untuk membedakan persist yang
   * sukses dari yang gagal. null bila belum ada upaya tulis.
   */
  public getLastSaveResult(): StorageResult | null {
    return this.lastSaveResult;
  }

  // ===========================================================================
  // PERSISTENCE & LEGACY MIGRATION
  // ===========================================================================

  // ===========================================================================
  // WP02-DEFECT-1 (2026-11-24) — MERGE MULTI-TAB
  // ---------------------------------------------------------------------------
  // Akar cacat: saveToStorage lama menulis SELURUH peta in-memory
  // (dimuat sekali di konstruktor) tanpa membaca ulang storage — dua tab
  // yang sama-sama mengirim saling menghapus pesan tersimpan tab lain
  // (last-write-wins peta utuh, tanpa error). Perbaikan:
  //  (1) merge-on-save — baca-segar + gabung per-percakapan sebelum
  //      tulis; percakapan yang hanya ada di storage TIDAK PERNAH
  //      dihapus oleh simpan ini; pesan digabung per-message-id
  //      (dua tab dapat menulis ke percakapan aktif yang SAMA);
  //  (2) tombstone penghapusan tersimpan (DELETED_CONVERSATIONS_KEY)
  //      agar merge tidak membangkitkan hapusan user;
  //  (3) langganan storage lintas-tab (konstruktor) → refreshFromStorage
  //      agar tab yang tidak menulis tetap segar.
  // Perilaku satu-tab TIDAK berubah: bila storage == memori, fast path
  // mengembalikan referensi lokal yang sama dan byte yang ditulis sama
  // persis dengan kode lama.
  // ===========================================================================

  /**
   * Baca peta percakapan terkini dari storage tanpa menyentuh state
   * in-memory. [] = kunci tidak ada; null = rusak/tak-terbaca
   * (pemanggil fail-closed ke perilaku lama: tulis peta lokal).
   */
  private readStoredConversations(): AIConversation[] | null {
    try {
      if (typeof window === 'undefined') return null;
      const saved = localStorage.getItem(UNIFIED_CONVERSATIONS_KEY);
      if (!saved) return [];
      const parsed: unknown = JSON.parse(saved);
      if (!Array.isArray(parsed)) return null;
      return parsed.filter(
        (c): c is AIConversation =>
          !!c &&
          typeof (c as AIConversation).id === 'string' &&
          typeof (c as AIConversation).projectId === 'string' &&
          Array.isArray((c as AIConversation).messages),
      );
    } catch {
      return null;
    }
  }

  /** Gabungan tombstone sesi-ini + storage (timestamp max menang); entri kedaluwarsa (>30 hari) dibuang. */
  private readTombstones(): Map<string, number> {
    const out = new Map<string, number>(this.deletedAt);
    try {
      if (typeof window !== 'undefined') {
        const raw = localStorage.getItem(DELETED_CONVERSATIONS_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Record<string, unknown>;
          if (parsed && typeof parsed === 'object') {
            for (const [id, ts] of Object.entries(parsed)) {
              if (typeof ts === 'number' && Number.isFinite(ts)) {
                const prev = out.get(id);
                if (prev === undefined || ts > prev) out.set(id, ts);
              }
            }
          }
        }
      }
    } catch {
      /* storage tombstone rusak = abaikan; tombstone sesi tetap berlaku */
    }
    const cutoff = Date.now() - TOMBSTONE_RETENTION_MS;
    for (const [id, ts] of Array.from(out.entries())) {
      if (ts < cutoff) out.delete(id);
    }
    return out;
  }

  /**
   * Tulis gabungan tombstone (sesi + storage, union — komutatif,
   * sehingga dua tab yang menghapus percakapan berbeda bersamaan tidak
   * saling menimpa) dikurangi id yang digantikan aktivitas lebih baru.
   * Peta kosong = hapus kunci agar storage tetap bersih.
   */
  private persistTombstones(dropIds: string[] = []): void {
    try {
      if (typeof window === 'undefined') return;
      const merged = this.readTombstones();
      for (const id of dropIds) merged.delete(id);
      this.deletedAt = merged;
      if (merged.size === 0) {
        try {
          localStorage.removeItem(DELETED_CONVERSATIONS_KEY);
        } catch {}
        return;
      }
      safeSetJSON(DELETED_CONVERSATIONS_KEY, Object.fromEntries(merged));
    } catch {
      /* gagal tulis tombstone ≠ gagal hapus — hapus peta tetap jalan */
    }
  }

  /**
   * Gabung satu percakapan dari dua salinan (lokal vs storage).
   * null = percakapan mati menurut tombstone (kedua salinan mendahului
   * penghapusan). `supersededTombstone` = ada aktivitas eksplisit yang
   * lebih baru daripada hapusan, sehingga tombstone harus dicabut.
   */
  private mergeOneConversation(
    local: AIConversation | undefined,
    stored: AIConversation | undefined,
    tombstones: Map<string, number>,
    clearedAt: Map<string, number>,
  ): { merged: AIConversation | null; supersededTombstone: boolean } {
    const tomb = tombstones.get((local ?? stored)?.id as string);
    const localAlive = local !== undefined && (tomb === undefined || local.updatedAt > tomb);
    const storedAlive = stored !== undefined && (tomb === undefined || stored.updatedAt > tomb);
    if (!localAlive && !storedAlive) return { merged: null, supersededTombstone: false };
    // Satu sisi hidup sesudah tombstone = aktivitas eksplisit yang lebih
    // baru daripada hapusan → hapusan digantikan (fail-closed: pesan baru
    // tidak boleh hilang karena hapusan lama).
    const supersededTombstone = tomb !== undefined && (localAlive || storedAlive);
    if (!storedAlive) return { merged: local as AIConversation, supersededTombstone };
    if (!localAlive) return { merged: stored as AIConversation, supersededTombstone };
    const l = local as AIConversation;
    const s = stored as AIConversation;
    // Pesan storage yang mendahului clear sesi-ini adalah pesan yang
    // sengaja dikosongkan user — jangan dibangkitkan.
    const cleared = clearedAt.get(l.id);
    if (cleared !== undefined && s.updatedAt <= cleared) {
      return { merged: l, supersededTombstone };
    }
    const lIds = new Set(l.messages.map((m) => m.id));
    const sIds = new Set(s.messages.map((m) => m.id));
    const lCoversS = s.messages.every((m) => lIds.has(m.id));
    const sCoversL = l.messages.every((m) => sIds.has(m.id));
    // Fast path satu-tab: salinan lokal sudah memuat semua pesan
    // storage dan lebih baru → kembalikan referensi yang sama persis
    // (byte yang ditulis identik dengan kode lama).
    if (lCoversS && l.updatedAt >= s.updatedAt) return { merged: l, supersededTombstone };
    if (sCoversL && s.updatedAt >= l.updatedAt) return { merged: s, supersededTombstone };
    // Union per-pesan: kedua sisi menyumbang pesan yang tidak dimiliki
    // sisi lain (kasus B18: dua tab menulis ke percakapan aktif yang
    // SAMA). Konflik isi pesan yang sama → salinan yang percakapannya
    // lebih baru menang; urutan deterministik (createdAt, id) agar
    // semua tab konvergen ke urutan yang sama.
    const newer = l.updatedAt >= s.updatedAt ? l : s;
    const older = newer === l ? s : l;
    const byId = new Map<string, AIMessage>();
    for (const m of older.messages) byId.set(m.id, m);
    for (const m of newer.messages) byId.set(m.id, m);
    const messages = Array.from(byId.values()).sort((a, b) =>
      a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    );
    const combined = messages.length !== newer.messages.length;
    return {
      merged: {
        ...newer,
        messages,
        createdAt: Math.min(l.createdAt, s.createdAt),
        updatedAt: Math.max(l.updatedAt, s.updatedAt),
        // Ringkasan adalah cache turunan pesan — gabungan dari dua sisi
        // membuat ringkasan sisi mana pun basi; buang agar dihitung
        // ulang deterministik (bukan dipertahankan salah).
        summary: combined ? undefined : newer.summary,
      },
      supersededTombstone,
    };
  }

  /**
   * Gabung peta lokal dengan salinan storage terkini. Urutan lokal
   * dipertahankan; entri storage-only ditambahkan di akhir sesuai
   * urutan storage. `changedIds` = id yang isinya berbeda dari memori
   * (adopsi baru / salinan storage / union); `droppedIds` = id lokal
   * yang mati menurut tombstone.
   */
  private mergeMaps(stored: AIConversation[]): {
    merged: Map<string, AIConversation>;
    changedIds: string[];
    droppedIds: string[];
    supersededTombstones: string[];
  } {
    const tombstones = this.readTombstones();
    const storedById = new Map<string, AIConversation>();
    for (const c of stored) {
      if (!storedById.has(c.id)) storedById.set(c.id, c);
    }
    const merged = new Map<string, AIConversation>();
    const changedIds: string[] = [];
    const droppedIds: string[] = [];
    const supersededTombstones: string[] = [];
    const seen = new Set<string>();
    const idsInOrder: string[] = [...this.conversations.keys(), ...storedById.keys()].filter((id) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    for (const id of idsInOrder) {
      const local = this.conversations.get(id);
      const s = storedById.get(id);
      const { merged: m, supersededTombstone } = this.mergeOneConversation(
        local,
        s,
        tombstones,
        this.clearedAt,
      );
      if (supersededTombstone) supersededTombstones.push(id);
      if (m === null) {
        if (local !== undefined) droppedIds.push(id);
        continue;
      }
      merged.set(id, m);
      // m !== local mencakup adopsi storage + union; fast path
      // keep-local mengembalikan referensi yang sama → tidak berubah.
      if (local === undefined || m !== local) changedIds.push(id);
    }
    return { merged, changedIds, droppedIds, supersededTombstones };
  }

  /**
   * Refresh in-memory dari storage sesudah tab lain menulis (dipicu
   * storage event; TIDAK PERNAH menulis balik ke kunci percakapan).
   * Emit CONVERSATION_UPDATED per percakapan yang berubah dan
   * CONVERSATION_DELETED per percakapan yang mati menurut tombstone —
   * kedua subscriber (view.tsx, chatbox) hanya me-refresh riwayat dari
   * store, jadi emit ini aman. Tanpa perubahan = tanpa emit (tanpa
   * render churn).
   */
  private refreshFromStorage(): void {
    try {
      if (typeof window === 'undefined') return;
      const stored = this.readStoredConversations();
      if (stored === null) return; // rusak = jangan sentuh memori
      const { merged, changedIds, droppedIds, supersededTombstones } = this.mergeMaps(stored);
      if (changedIds.length === 0 && droppedIds.length === 0 && supersededTombstones.length === 0) return;
      const before = this.conversations;
      this.conversations = merged;
      if (supersededTombstones.length > 0) this.persistTombstones(supersededTombstones);
      const now = new Date().toISOString();
      for (const id of droppedIds) {
        const projectId = before.get(id)?.projectId;
        if (!projectId) continue;
        this.emit({
          type: 'CONVERSATION_DELETED',
          conversationId: id,
          projectId,
          timestamp: now,
        });
      }
      for (const id of changedIds) {
        const conv = merged.get(id);
        if (!conv) continue;
        this.emit({
          type: 'CONVERSATION_UPDATED',
          conversationId: id,
          projectId: conv.projectId,
          payload: { messages: [...conv.messages] },
          timestamp: now,
        });
      }
    } catch (err) {
      console.warn('[UnifiedConversationStore] Failed to refresh conversations from external storage change:', err);
    }
  }

  private saveToStorage(): void {
    try {
      if (typeof window === 'undefined') return;
      // WP02-DEFECT-1: baca-segar + merge sebelum tulis. Tulis peta
      // utuh tanpa merge menghapus pesan tab lain (last-write-wins).
      const stored = this.readStoredConversations();
      let serializable: AIConversation[];
      if (stored === null) {
        // Storage rusak/tak-terbaca: fail-closed ke perilaku lama
        // (tulis peta lokal) agar satu kegagalan baca tidak memblokir
        // semua penyimpanan.
        serializable = Array.from(this.conversations.values());
      } else {
        const { merged, supersededTombstones } = this.mergeMaps(stored);
        // Adopsi hasil merge ke memori: sesudah simpan, memori ==
        // storage (tab penulis langsung melihat pesan tab lain).
        this.conversations = merged;
        if (supersededTombstones.length > 0) {
          this.persistTombstones(supersededTombstones);
        }
        serializable = Array.from(merged.values());
      }
      const result = safeSetJSON(UNIFIED_CONVERSATIONS_KEY, serializable);
      this.lastSaveResult = result;
      if (!result.ok) {
        // Honest failure: keep in-memory data, warn (do NOT delete old data).
        console.warn('[UnifiedConversationStore] Save failed:', result.reason, result.message);
      }
    } catch (err) {
      this.lastSaveResult = { ok: false, reason: 'UNKNOWN', message: 'Penyimpanan gagal. Perubahan tidak tersimpan.' };
      console.warn('[UnifiedConversationStore] Failed to save conversations to localStorage:', err);
    }
  }

  private loadFromStorage(): void {
    if (this.initialized) return;
    this.initialized = true;

    try {
      if (typeof window === 'undefined') return;

      // 1. Try loading unified v2 conversations
      const saved = localStorage.getItem(UNIFIED_CONVERSATIONS_KEY);
      if (saved) {
        const parsed: AIConversation[] = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          parsed.forEach((c) => {
            if (c.id && c.projectId) {
              this.conversations.set(c.id, c);
            }
          });
        }
      }

      // 2. Migration from legacy Magic AI Sessions v1 if any
      const legacySessionsRaw = localStorage.getItem(LEGACY_SESSIONS_STORAGE_KEY);
      if (legacySessionsRaw) {
        const legacySessions = JSON.parse(legacySessionsRaw);
        if (Array.isArray(legacySessions)) {
          legacySessions.forEach((legacy) => {
            if (legacy.id && !this.conversations.has(legacy.id)) {
              const projId = legacy.projectId || 'legacy-project';
              const migratedMessages: AIMessage[] = (legacy.messages || []).map((m: any) => ({
                id: m.id || `legacy-msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                conversationId: legacy.id,
                projectId: projId,
                role: m.sender === 'user' ? 'user' : 'assistant',
                content: m.content || '',
                badge: m.badge,
                stats: m.stats,
                actionProposal: m.actionProposal,
                table: m.table,
                wizardResponse: m.wizardResponse,
                quickActionResponse: m.quickActionResponse,
                followUpSuggestions: m.followUpSuggestions,
                isError: m.isError,
                status: 'completed',
                createdAt: new Date(legacy.createdAt || Date.now()).toISOString(),
                timestamp: m.timestamp || new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
              }));

              this.conversations.set(legacy.id, {
                id: legacy.id,
                projectId: projId,
                title: legacy.title || 'Percakapan Terpelihara',
                messages: migratedMessages,
                createdAt: legacy.createdAt || Date.now(),
                updatedAt: legacy.updatedAt || Date.now(),
              });
            }
          });
        }
      }
    } catch (err) {
      console.warn('[UnifiedConversationStore] Failed to load or migrate conversations:', err);
    }
  }
}

export const unifiedConversationStore = UnifiedConversationStore.getInstance();

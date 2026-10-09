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
import { safeSetJSON } from '../../../utils/safeStorage';
import type {
  AIConversation,
  AIMessage,
  AIConversationEvent,
  AIConversationListener,
} from './conversationTypes';

const UNIFIED_CONVERSATIONS_KEY = 'ezrab_unified_conversations_v2';
const ACTIVE_CONVERSATION_PREFIX = 'ezrab_active_conversation_v2_';
const LEGACY_SESSIONS_STORAGE_KEY = 'ezrab_magic_ai_sessions_v1';

export class UnifiedConversationStore {
  private static instance: UnifiedConversationStore | null = null;
  private conversations: Map<string, AIConversation> = new Map();
  private activeConversationByProject: Map<string, string> = new Map();
  private listeners: Set<AIConversationListener> = new Set();
  private initialized = false;

  private constructor() {
    this.loadFromStorage();
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
    conv.updatedAt = Date.now();
    this.saveToStorage();

    this.emit({
      type: 'CONVERSATION_UPDATED',
      conversationId,
      projectId: validProjectId,
      payload: { messages: [] },
      timestamp: new Date().toISOString(),
    });
  }

  // ===========================================================================
  // PERSISTENCE & LEGACY MIGRATION
  // ===========================================================================

  private saveToStorage(): void {
    try {
      if (typeof window === 'undefined') return;
      const serializable = Array.from(this.conversations.values());
      const result = safeSetJSON(UNIFIED_CONVERSATIONS_KEY, serializable);
      if (!result.ok) {
        // Honest failure: keep in-memory data, warn (do NOT delete old data).
        console.warn('[UnifiedConversationStore] Save failed:', result.reason, result.message);
      }
    } catch (err) {
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

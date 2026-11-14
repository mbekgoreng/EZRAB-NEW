/**
 * Chat AI UI-state persistence (D-46 / D-47 / D-49, Batch E).
 *
 * One-key localStorage writes through the safe-storage layer
 * (`src/utils/safeStorage.ts`) — the same persistence model the
 * conversation store uses (never claims success on failure, never
 * auto-deletes old data to free space).
 *
 * - D-46: composer draft, keyed per conversation (`ezrab_chat_draft_<id>`),
 *   validated against the owning project on restore, cleared on send.
 * - D-47: chat AI mode (`ezrab_chat_ai_mode`), validated to the two
 *   known modes, default 'fast' (Cepat).
 * - D-49: the header version label lives here as the single source of
 *   truth (MEMORY: the header must show 'V 01.00').
 */

import { safeGetItem, safeSetItem, safeSetJSON } from '../../utils/safeStorage';

/** Header version label (single source; rendered as `V ${EZRAB_CHAT_AI_VERSION}`). */
export const EZRAB_CHAT_AI_VERSION = '01.00';

export type ChatAiMode = 'fast' | 'advanced';

/** D-47 — localStorage key for the selected chat AI mode. */
export const CHAT_AI_MODE_KEY = 'ezrab_chat_ai_mode';

export function loadChatAiMode(): ChatAiMode {
  const raw = safeGetItem(CHAT_AI_MODE_KEY);
  return raw === 'fast' || raw === 'advanced' ? raw : 'fast';
}

export function saveChatAiMode(mode: ChatAiMode): boolean {
  return safeSetItem(CHAT_AI_MODE_KEY, mode).ok;
}

/** D-46 — composer draft record (text + owning project + save time). */
export interface ChatDraftRecord {
  text: string;
  projectId: string;
  savedAt: number;
}

export const CHAT_DRAFT_KEY_PREFIX = 'ezrab_chat_draft_';

export function chatDraftKey(conversationId: string): string {
  return `${CHAT_DRAFT_KEY_PREFIX}${conversationId}`;
}

/**
 * Load the saved draft for one conversation. Returns '' when there is no
 * draft, the record is malformed, or the record belongs to a different
 * project scope (a draft must never leak across projects).
 */
export function loadChatDraft(conversationId: string, projectId: string): string {
  if (!conversationId) return '';
  const raw = safeGetItem(chatDraftKey(conversationId));
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw) as Partial<ChatDraftRecord>;
    if (!parsed || typeof parsed.text !== 'string') return '';
    if (parsed.projectId && parsed.projectId !== projectId) return '';
    return parsed.text;
  } catch {
    return '';
  }
}

/**
 * Save (debounced by the caller) the composer draft for one conversation.
 * An empty draft clears the key instead of writing an empty record.
 */
export function saveChatDraft(conversationId: string, projectId: string, text: string): boolean {
  if (!conversationId) return false;
  if (!text) return clearChatDraft(conversationId);
  const record: ChatDraftRecord = { text, projectId, savedAt: Date.now() };
  return safeSetJSON(chatDraftKey(conversationId), record).ok;
}

/** Remove the saved draft for one conversation (e.g. after a successful send). */
export function clearChatDraft(conversationId: string): boolean {
  if (!conversationId) return false;
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    window.localStorage.removeItem(chatDraftKey(conversationId));
    return true;
  } catch {
    return false;
  }
}

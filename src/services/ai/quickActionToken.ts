/**
 * Quick Action token handling (D-50, Batch E — EZRAB FULL REPAIR).
 *
 * The `[QUICK_ACTION_TRIGGER:<ACTION_ID>]` prefix is an INTERNAL routing
 * signal. It must NEVER appear in a user-visible message bubble, in a
 * persisted conversation message, or in a derived history title. The
 * action travels as structured data (`quickActionId`) instead; the
 * message content carries only the human prompt.
 *
 * Defence in depth:
 * - `composeQuickActionSend` builds the send request WITHOUT the token
 *   (and refuses unknown/disabled actions — a Quick Action must map to
 *   a valid internal action).
 * - `stripQuickActionToken` removes a legacy token from any text before
 *   it is persisted or displayed (coAssistantService + Chat AI restore /
 *   history-title fallback).
 * - `MockAiProvider.chat` accepts the structured id as an option and
 *   prefers it over the legacy token regex (kept only for old callers).
 */

import {
  QUICK_ACTION_CONTRACTS,
  type QuickActionContract,
} from '../../data/quickActionContracts';

/**
 * Legacy internal routing token, anchored at the start of the message.
 * Case-insensitive on the literal; the action id is upper-cased on read.
 */
export const QUICK_ACTION_TOKEN_RE = /^\[QUICK_ACTION_TRIGGER:([A-Z_]+)\]\s*/i;

/** Remove a leading internal routing token (if any) from display/persist text. */
export function stripQuickActionToken(text: string): string {
  return (text ?? '').replace(QUICK_ACTION_TOKEN_RE, '');
}

/** Extract the action id from a leading internal routing token, or null. */
export function extractQuickActionToken(text: string): string | null {
  const m = (text ?? '').match(QUICK_ACTION_TOKEN_RE);
  return m ? m[1].toUpperCase() : null;
}

/**
 * Resolve an action id to its contract. Returns null for unknown ids and
 * for contracts that are disabled — neither may ever be sent.
 */
export function resolveQuickActionContract(actionId: string): QuickActionContract | null {
  if (!actionId || typeof actionId !== 'string') return null;
  const contract = QUICK_ACTION_CONTRACTS[actionId.toUpperCase()];
  return contract && contract.enabled ? contract : null;
}

export interface QuickActionSendRequest {
  /** Human prompt only — guaranteed free of the internal token. */
  message: string;
  /** Structured action id, carried out-of-band (never inside `message`). */
  quickActionId: string;
  /** Resolved contract (label/description/risk shown in the confirm dialog). */
  contract: QuickActionContract;
}

/**
 * Compose a Quick Action send request. Returns null when the action id
 * does not map to a valid enabled contract, or when the human prompt is
 * empty after stripping — callers must not send in that case.
 */
export function composeQuickActionSend(
  actionId: string,
  initialPrompt: string,
): QuickActionSendRequest | null {
  const contract = resolveQuickActionContract(actionId);
  const message = stripQuickActionToken((initialPrompt ?? '').trim());
  if (!contract || !message) return null;
  return { message, quickActionId: contract.actionId, contract };
}

/**
 * Routing context for the AI provider call. This line travels in the
 * SERVER prompt only (alongside the tool section) — it is never
 * persisted to the conversation store and never displayed to the user.
 */
export function quickActionContextLine(contract: QuickActionContract): string {
  return (
    `KONTEKS SISTEM — AKSI CEPAT: ${contract.actionId} (${contract.label}). ` +
    `${contract.description}`
  );
}

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
import type { QuickActionDialogueData } from '../../components/copilot/QuickActionDialogueRenderer';

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

/**
 * D-50 (perbaikan uji AI live 2026-11-15) — pemetaan saran lanjutan →
 * kontrak Quick Action.
 *
 * Klik chip saran di chatbox mengirim teks saran sebagai pesan
 * (onSelectSuggestion → handleSendMessage). Bila teks itu PERSIS label
 * sebuah Quick Action yang aktif, pemetaan ini mengembalikan kontraknya
 * sehingga service dapat membuka DIALOG aksi itu (QuickActionDialogue-
 * Renderer) tanpa panggilan gateway — bukan auto-send ke AI.
 *
 * Pencocokan: label kontrak saja, case-insensitive, tanpa spasi tepi.
 * Token mentah `[QUICK_ACTION_TRIGGER:…]` TIDAK PERNAH menjadi saran,
 * jadi tidak ada jalur token di sini — saran adalah label manusia.
 */
export function resolveQuickActionFromSuggestion(
  suggestion: string,
): QuickActionContract | null {
  const label = (suggestion ?? '').trim().toLowerCase();
  if (!label) return null;
  for (const contract of Object.values(QUICK_ACTION_CONTRACTS)) {
    if (!contract.enabled) continue;
    if (contract.label.trim().toLowerCase() === label) return contract;
  }
  return null;
}

/**
 * D-50 — bangun payload dialog Quick Action LOKAL (tanpa panggilan
 * server) dari sebuah kontrak. Bentuknya SAMA dengan fallback lokal
 * `quickActionService.startSession`, sehingga QuickActionDialogue-
 * Renderer menanganinya identik: judul + pilihan awal kontrak,
 * `canCancel` aktif, tanpa langkah mundur. Teks pesan hanya berisi
 * label manusia — tanpa token internal apa pun.
 */
export function buildLocalQuickActionDialogue(
  contract: QuickActionContract,
): QuickActionDialogueData {
  return {
    responseType: 'quick_action_dialogue',
    actionId: contract.actionId,
    sessionId: `qa_local_${Date.now()}`,
    currentState: 'ASKING_CLARIFICATION',
    title: contract.label,
    message: `Siap, saya bantu memproses ${contract.label}. Silakan pilih opsi di bawah ini:`,
    choices: contract.initialChoices || [],
    collectedParameters: {},
    followUpSuggestions: [],
    canGoBack: false,
    canCancel: true,
  };
}

/**
 * D-50 — derivasi saran lanjutan KONTEKSTUAL sesudah balasan live.
 *
 * Balasan gateway live tidak pernah membawa `followUpSuggestions`
 * (server tidak mengirimnya), sehingga chip Quick Action tidak pernah
 * muncul sesudah balasan AI. Fungsi murni ini menempel saran di sisi
 * klien dari konteks percakapan: pesan pengguna + teks balasan.
 *
 * Minimal (hanya pemetaan yang diminta D-50): konteks volume →
 * saran 'Hitung Volume' (label kontrak HITUNG_VOLUME). Saran adalah
 * label kontrak, BUKAN token mentah — token tidak pernah masuk saran
 * maupun teks pesan. Aksi yang baru saja dijalankan (`excludeActionId`)
 * tidak disarankan ulang. Konteks non-volume → undefined (perilaku
 * lama dipertahankan: tanpa saran).
 */
const VOLUME_HINT_RE =
  /\bvolume\b|\bm[³3]\b|kubik|\bqto\b|quantity take|\btake[\s-]?off\b/i;

export function deriveFollowUpSuggestions(
  userMessage: string,
  replyText: string,
  excludeActionId?: string | null,
): string[] | undefined {
  const haystack = `${userMessage ?? ''}\n${replyText ?? ''}`;
  if (!VOLUME_HINT_RE.test(haystack)) return undefined;
  const contract = resolveQuickActionContract('HITUNG_VOLUME');
  if (!contract) return undefined;
  if (excludeActionId && contract.actionId === excludeActionId.toUpperCase()) {
    return undefined;
  }
  return [contract.label];
}

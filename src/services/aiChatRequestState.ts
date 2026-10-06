import type { ChatApiRequest } from './aiApiClient';

/** Pure request-state rules shared by the chatbox and its non-browser tests. */
export function shouldAppendUserMessage(isRetry = false): boolean {
  return !isRetry;
}

export function canRetryRequest(
  request: ChatApiRequest | null,
  activeProjectId: string | null | undefined,
): request is ChatApiRequest {
  return Boolean(request && activeProjectId && request.projectId === activeProjectId);
}

export function requestFinishedState(): { isLoading: false; retryingMessageId: null } {
  return { isLoading: false, retryingMessageId: null };
}

/**
 * AI gateway auth headers (Phase 2 hardening).
 *
 * The Vercel AI gateway (api/_lib/aiGateway.js) accepts a service token via
 * `x-ezrab-api-token` when AI_GATEWAY_TOKEN is configured server-side.
 * The browser copy comes from VITE_AI_GATEWAY_TOKEN (public by nature —
 * it raises the bar against casual abuse and enables token rotation,
 * but it is NOT a substitute for per-user authentication).
 *
 * Never put real user identity in these headers: the gateway ignores
 * x-user-id / x-user-role / x-workspace-id entirely (they are spoofable).
 */
export function aiGatewayHeaders(): Record<string, string> {
  try {
    const t = (import.meta as unknown as { env?: Record<string, string | undefined> })?.env
      ?.VITE_AI_GATEWAY_TOKEN;
    if (t && t.trim()) return { 'x-ezrab-api-token': t.trim() };
  } catch {
    /* non-browser / no env — no header */
  }
  return {};
}

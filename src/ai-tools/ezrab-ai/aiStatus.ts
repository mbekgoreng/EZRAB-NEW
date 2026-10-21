/**
 * Honest AI status derivation for the Chat AI header (Fase 3B).
 *
 * The old header printed a static "Online" regardless of reality. This
 * module derives the label ONLY from signals the app actually observed:
 *  - gateway reachability: the free /api/ai/engine-status diagnostic
 *    answered (proves the gateway is reachable and configured — it does
 *    NOT prove any provider can complete a request, and the labels
 *    never claim that);
 *  - auth kind: which verified identity the browser holds
 *    (registered / demo / none);
 *  - last outcome: what the most recent real AI request actually did.
 * No paid provider call is ever made to refresh this status.
 */
import type { AuthKind } from '../../lib/demoSession';

export type GatewayReach = 'unknown' | 'reachable' | 'unreachable';
export type LastOutcome = 'none' | 'success' | 'failure' | 'auth-error' | 'demo-restricted';
export type AiStatusTone = 'ok' | 'warn' | 'error' | 'neutral' | 'busy';

export interface AiStatusInput {
  gateway: GatewayReach;
  authKind: AuthKind;
  lastOutcome: LastOutcome;
  busy: boolean;
}

export interface AiStatus {
  label: string;
  tone: AiStatusTone;
}

export function deriveAiStatus(input: AiStatusInput): AiStatus {
  if (input.busy) return { label: 'Sedang berpikir…', tone: 'busy' };
  if (input.gateway === 'unreachable') {
    return { label: 'AI tidak terjangkau — periksa koneksi internet', tone: 'error' };
  }
  if (input.lastOutcome === 'auth-error') {
    return { label: 'Sesi berakhir — silakan login kembali', tone: 'error' };
  }
  if (input.lastOutcome === 'demo-restricted') {
    return { label: 'Mode Demo — permintaan terakhir di luar batas demo', tone: 'warn' };
  }
  if (input.lastOutcome === 'failure') {
    return { label: 'AI sedang gangguan — permintaan terakhir gagal', tone: 'error' };
  }
  if (input.gateway === 'unknown') {
    return { label: 'Memeriksa koneksi AI…', tone: 'neutral' };
  }
  if (input.authKind === 'registered') {
    return { label: 'AI siap — masuk sebagai pengguna terdaftar', tone: 'ok' };
  }
  if (input.authKind === 'demo') {
    return { label: 'AI siap — Mode Demo (Cepat saja, terbatas)', tone: 'ok' };
  }
  return { label: 'Gateway terjangkau — login diperlukan untuk AI Online', tone: 'warn' };
}

/** Map a send() failure's errorCode onto a status outcome. */
export function outcomeFromErrorCode(errorCode: string | undefined): LastOutcome {
  if (errorCode === 'AUTH_REQUIRED') return 'auth-error';
  if (errorCode === 'DEMO_RESTRICTED') return 'demo-restricted';
  return 'failure';
}

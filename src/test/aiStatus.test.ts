/**
 * Fase 3B — honest AI status derivation + provider error mapping.
 * Run: npx vitest run src/test/aiStatus.test.ts
 */
import { describe, it, expect } from 'vitest';
import { deriveAiStatus, outcomeFromErrorCode } from '../ai-tools/ezrab-ai/aiStatus';
import { mapGatewayHttpError } from '../ai-tools/providerClient';

describe('deriveAiStatus — never claims more than the signals prove', () => {
  it('busy wins over everything', () => {
    const s = deriveAiStatus({ gateway: 'unreachable', authKind: 'none', lastOutcome: 'failure', busy: true });
    expect(s.label).toContain('Sedang berpikir');
    expect(s.tone).toBe('busy');
  });
  it('unreachable gateway is an error, never "Online"', () => {
    const s = deriveAiStatus({ gateway: 'unreachable', authKind: 'registered', lastOutcome: 'none', busy: false });
    expect(s.tone).toBe('error');
    expect(s.label).not.toContain('Online');
  });
  it('auth-error outcome names the real cause (gateway refusal), never a login instruction', () => {
    // F3: this build has AUTH_ENABLED=false — there is no sign-in screen.
    const s = deriveAiStatus({ gateway: 'reachable', authKind: 'none', lastOutcome: 'auth-error', busy: false });
    expect(s.label.toLowerCase()).not.toContain('login');
    expect(s.label).toContain('kode akses');
    expect(s.tone).toBe('error');
  });
  it('demo-restricted outcome explains the demo boundary', () => {
    const s = deriveAiStatus({ gateway: 'reachable', authKind: 'demo', lastOutcome: 'demo-restricted', busy: false });
    expect(s.label).toContain('Mode Demo');
    expect(s.tone).toBe('warn');
  });
  it('failed last request is reported as a disturbance, not hidden', () => {
    const s = deriveAiStatus({ gateway: 'reachable', authKind: 'registered', lastOutcome: 'failure', busy: false });
    expect(s.tone).toBe('error');
  });
  it('unknown gateway shows a checking state', () => {
    const s = deriveAiStatus({ gateway: 'unknown', authKind: 'none', lastOutcome: 'none', busy: false });
    expect(s.tone).toBe('neutral');
  });
  it('reachable + registered = ready as registered user', () => {
    const s = deriveAiStatus({ gateway: 'reachable', authKind: 'registered', lastOutcome: 'success', busy: false });
    expect(s.tone).toBe('ok');
    expect(s.label).toContain('pengguna terdaftar');
  });
  it('reachable + demo = ready but visibly limited demo', () => {
    const s = deriveAiStatus({ gateway: 'reachable', authKind: 'demo', lastOutcome: 'none', busy: false });
    expect(s.label).toContain('Mode Demo');
  });
  it('reachable + no identity warns access is not active (no fake Online, no login fiction)', () => {
    const s = deriveAiStatus({ gateway: 'reachable', authKind: 'none', lastOutcome: 'none', busy: false });
    expect(s.tone).toBe('warn');
    expect(s.label).toContain('belum aktif');
    expect(s.label.toLowerCase()).not.toContain('login');
  });
});

describe('outcomeFromErrorCode', () => {
  it('maps gateway codes onto status outcomes', () => {
    expect(outcomeFromErrorCode('AUTH_REQUIRED')).toBe('auth-error');
    expect(outcomeFromErrorCode('DEMO_RESTRICTED')).toBe('demo-restricted');
    expect(outcomeFromErrorCode('MODEL_ERROR')).toBe('failure');
    expect(outcomeFromErrorCode(undefined)).toBe('failure');
  });
});

describe('mapGatewayHttpError — gateway failures stay distinguishable (Fase 3B)', () => {
  it('401 surfaces as AUTH_REQUIRED with the real cause + access-code action, not retryable', () => {
    const m = mapGatewayHttpError(401, 'AUTH_REQUIRED');
    expect(m.code).toBe('AUTH_REQUIRED');
    // F3: no sign-in screen exists in this build — the message must never
    // instruct the user to log in; it names the gateway refusal instead.
    expect(m.message.toLowerCase()).not.toContain('login');
    expect(m.message).toContain('kode akses');
    expect(m.retryable).toBe(false);
  });
  it('DEMO_RESTRICTED message also avoids the impossible login instruction', () => {
    const m = mapGatewayHttpError(403, 'DEMO_RESTRICTED');
    expect(m.message.toLowerCase()).not.toContain('login');
  });
  it('401 without a body code still maps to AUTH_REQUIRED by status', () => {
    expect(mapGatewayHttpError(401, '').code).toBe('AUTH_REQUIRED');
  });
  it('403 DEMO_RESTRICTED surfaces as DEMO_RESTRICTED, not the origin text', () => {
    const m = mapGatewayHttpError(403, 'DEMO_RESTRICTED');
    expect(m.code).toBe('DEMO_RESTRICTED');
    expect(m.message).toContain('Mode Demo');
  });
  it('403 without a body code keeps the origin/outage mapping', () => {
    const m = mapGatewayHttpError(403, '');
    expect(m.code).toBe('MODEL_ERROR');
    expect(m.message).toContain('tidak dapat diakses');
  });
  it('429 keeps the rate-limit mapping and is retryable', () => {
    const m = mapGatewayHttpError(429, 'RATE_LIMITED');
    expect(m.message).toContain('Terlalu banyak permintaan');
    expect(m.retryable).toBe(true);
  });
  it('5xx maps to the disturbance message and is retryable', () => {
    const m = mapGatewayHttpError(502, '');
    expect(m.message).toContain('gangguan');
    expect(m.retryable).toBe(true);
  });
});

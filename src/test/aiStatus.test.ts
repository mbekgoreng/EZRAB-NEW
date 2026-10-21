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
  it('auth-error outcome asks for re-login', () => {
    const s = deriveAiStatus({ gateway: 'reachable', authKind: 'none', lastOutcome: 'auth-error', busy: false });
    expect(s.label).toContain('login');
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
  it('reachable + no identity warns that login is required (no fake Online)', () => {
    const s = deriveAiStatus({ gateway: 'reachable', authKind: 'none', lastOutcome: 'none', busy: false });
    expect(s.tone).toBe('warn');
    expect(s.label).toContain('login diperlukan');
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
  it('401 surfaces as AUTH_REQUIRED with a login message, not retryable', () => {
    const m = mapGatewayHttpError(401, 'AUTH_REQUIRED');
    expect(m.code).toBe('AUTH_REQUIRED');
    expect(m.message).toContain('login');
    expect(m.retryable).toBe(false);
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

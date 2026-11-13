/**
 * MAGIC-AI-FIX (2026-11-13) — regresi perbaikan tombol "Analisis dengan AI"
 * di spreadsheet yang tampak diam total (master prompt owner 2026-11-13).
 *
 * Yang diuji di sini (tanpa render React):
 *  - helper `withTimeout`: resolve cepat → nilai asli; hang → AiTimeoutError
 *    pada waktunya; reject cepat → error asli diteruskan (bukan timeout);
 *  - konstanta batas (auth 10 dtk, dynamic import 15 dtk) + pesan banner;
 *  - pemetaan timeout auth → structured error MODEL_TIMEOUT (`authTimeoutResult`).
 *
 * Yang TIDAK diuji di sini (butuh browser, ditutup E2E pasca-perbaikan):
 *  opacity 0.55 tombol disabled, reset aiIsGenerating saat buka modal,
 *  dan alur klik → stub → preview → simpan.
 * Run: runner shim vitest (lihat run-magic-ai-fix-battery.sh).
 */
import { describe, it, expect } from 'vitest';
import {
  withTimeout,
  AiTimeoutError,
  isAiTimeoutError,
  AI_GATEWAY_AUTH_TIMEOUT_MS,
  AI_GATEWAY_AUTH_TIMEOUT_MESSAGE,
  AI_PROVIDER_IMPORT_TIMEOUT_MS,
  AI_PROVIDER_IMPORT_TIMEOUT_MESSAGE,
} from '../ai-tools/withTimeout';
import { authTimeoutResult } from '../ai-tools/providerClient';

const never = (): Promise<never> => new Promise(() => {});
const delayed = <T>(ms: number, value: T): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms));

describe('withTimeout', () => {
  it('resolve cepat → nilai asli diteruskan apa adanya', async () => {
    const sentinel = { marker: 'asli' };
    const out = await withTimeout(Promise.resolve(sentinel), 5000, 'tidak boleh timeout');
    expect(out).toBe(sentinel);
    expect(await withTimeout(Promise.resolve(42), 5000, 'x')).toBe(42);
  });

  it('resolve sesaat sebelum batas → nilai asli (bukan timeout)', async () => {
    const out = await withTimeout(delayed(50, 'tepat-waktu'), 2000, 'x');
    expect(out).toBe('tepat-waktu');
  });

  it('janji menggantung → AiTimeoutError pada waktunya dengan pesan yang diberikan', async () => {
    const t0 = Date.now();
    let caught: unknown = null;
    try {
      await withTimeout(never(), 100, AI_GATEWAY_AUTH_TIMEOUT_MESSAGE);
    } catch (err) {
      caught = err;
    }
    const elapsed = Date.now() - t0;
    expect(caught).toBeInstanceOf(AiTimeoutError);
    expect((caught as AiTimeoutError).name).toBe('AiTimeoutError');
    expect((caught as AiTimeoutError).timeoutMs).toBe(100);
    expect((caught as AiTimeoutError).message).toBe(AI_GATEWAY_AUTH_TIMEOUT_MESSAGE);
    // Tepat waktu: tidak lebih awal dari batas (minus jitter timer 20 ms),
    // tidak molor jauh melewatinya (batas longgar 3 dtk untuk mesin sibuk).
    expect(elapsed).toBeGreaterThanOrEqual(80);
    expect(elapsed).toBeLessThan(3000);
  });

  it('resolve lambat melewati batas → tetap timeout (nilai telat diabaikan)', async () => {
    const t0 = Date.now();
    let caught: unknown = null;
    try {
      await withTimeout(delayed(400, 'terlambat'), 100, AI_PROVIDER_IMPORT_TIMEOUT_MESSAGE);
    } catch (err) {
      caught = err;
    }
    const elapsed = Date.now() - t0;
    expect(isAiTimeoutError(caught)).toBe(true);
    // Pesan inilah yang catch modal tampilkan sebagai banner.
    expect((caught as Error).message).toBe(AI_PROVIDER_IMPORT_TIMEOUT_MESSAGE);
    expect(elapsed).toBeGreaterThanOrEqual(80);
    expect(elapsed).toBeLessThan(3000);
  });

  it('reject cepat → error asli diteruskan, BUKAN dibungkus timeout', async () => {
    const original = new Error('gagal-asli');
    let caught: unknown = null;
    try {
      await withTimeout(Promise.reject(original), 5000, 'x');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBe(original);
    expect(isAiTimeoutError(caught)).toBe(false);
  });
});

describe('isAiTimeoutError', () => {
  it('mengenali AiTimeoutError dan menolak error lain', () => {
    expect(isAiTimeoutError(new AiTimeoutError(10, 'm'))).toBe(true);
    expect(isAiTimeoutError(new Error('m'))).toBe(false);
    expect(isAiTimeoutError(null)).toBe(false);
    expect(isAiTimeoutError(undefined)).toBe(false);
    expect(isAiTimeoutError('AiTimeoutError')).toBe(false);
  });
});

describe('konstanta timeout Magic AI', () => {
  it('batas auth pra-fetch = 10 detik, batas import = 15 detik', () => {
    expect(AI_GATEWAY_AUTH_TIMEOUT_MS).toBe(10_000);
    expect(AI_PROVIDER_IMPORT_TIMEOUT_MS).toBe(15_000);
  });

  it('pesan banner auth menyebut verifikasi sesi + 10 detik', () => {
    expect(AI_GATEWAY_AUTH_TIMEOUT_MESSAGE).toContain('Verifikasi sesi AI terlalu lama');
    expect(AI_GATEWAY_AUTH_TIMEOUT_MESSAGE).toContain('10 detik');
  });

  it('pesan banner import menyebut modul AI + 15 detik', () => {
    expect(AI_PROVIDER_IMPORT_TIMEOUT_MESSAGE).toContain('Memuat modul AI terlalu lama');
    expect(AI_PROVIDER_IMPORT_TIMEOUT_MESSAGE).toContain('15 detik');
  });
});

describe('authTimeoutResult — pemetaan timeout → pesan banner', () => {
  it('menghasilkan structured error MODEL_TIMEOUT dengan pesan presis + retryable', () => {
    const err = authTimeoutResult('EZRAB_AI');
    expect(err.success).toBe(false);
    expect(err.errorCode).toBe('MODEL_TIMEOUT');
    expect(err.stage).toBe('EZRAB_AI:auth');
    expect(err.message).toBe(AI_GATEWAY_AUTH_TIMEOUT_MESSAGE);
    expect(err.message).toContain('Verifikasi sesi AI terlalu lama');
    expect(err.retryable).toBe(true);
  });

  it('stage mengikuti productId pemanggil', () => {
    expect(authTimeoutResult('DED_AI_FAST').stage).toBe('DED_AI_FAST:auth');
    expect(authTimeoutResult('DED_AI_FAST').errorCode).toBe('MODEL_TIMEOUT');
  });
});

/**
 * EZRAB Chat AI — CHANGE_PLAN (Workstream B1, 2026-11-19, §K baris 42
 * audit perintah Ezrab AI).
 *
 * "ganti paket ke Pro" → setPlan hook simulasi (useCreditSimulation).
 * SEMUA balasan berlabel SIMULASI — billing real belum ada. Ganti paket
 * mengatur ulang saldo simulasi ke jatah paket baru (top-up & bonus
 * simulasi ikut terhapus — perilaku mockSetPlan); karena itu handler
 * fail-closed bila paket aktif tidak diketahui (tanpa cek "sudah di
 * paket itu", pergantian sia-sia menghapus top-up).
 *
 * Catatan: P8 ("sisa kredit saya", CREDIT_BALANCE) SUDAH ADA sejak
 * c96881c — tidak dibangun ulang di sini; hanya dipin routing-nya agar
 * tidak terbajak pola CHANGE_PLAN.
 *
 * Run: npx vitest run src/test/chatChangePlanCommands.test.ts
 */
import { describe, it, expect } from 'vitest';
import { routeIntent } from '../ai-tools/ezrab-ai/intentRouter';
import {
  executeIntent,
  resolveCreditPlanName,
  type ChatActionContext,
  type ChangePlanResult,
} from '../ai-tools/ezrab-ai/actionRegistry';
import type { CreditPlan } from '../ai-credits/types';

const baseCtx = (over: Partial<ChatActionContext> = {}): ChatActionContext => ({
  navigate: () => {},
  currentMenu: 'ezrab-ai',
  activeProject: { id: 'proj-1', name: 'Proyek Satu' },
  projects: [{ id: 'proj-1', name: 'Proyek Satu' }],
  projectTotal: null,
  creditPlan: 'free',
  creditSource: 'simulation',
  ...over,
});

describe('CHANGE_PLAN: routing', () => {
  it('BK-1. "ganti paket ke pro" → CHANGE_PLAN + param "pro"', () => {
    const r = routeIntent('ganti paket ke pro');
    expect(r.intent).toBe('CHANGE_PLAN');
    expect(r.param).toBe('pro');
  });

  it('BK-2. "ubah paket saya jadi starter" → CHANGE_PLAN', () => {
    const r = routeIntent('ubah paket saya jadi starter');
    expect(r.intent).toBe('CHANGE_PLAN');
    expect(r.param).toBe('starter');
  });

  it('BK-3. "ganti paket" telanjang → CHANGE_PLAN tanpa param (handler menampilkan daftar)', () => {
    const r = routeIntent('ganti paket');
    expect(r.intent).toBe('CHANGE_PLAN');
    expect(r.param).toBeUndefined();
  });

  it('BK-4. "tolong ganti paket ke business" → CHANGE_PLAN (bukan HELP)', () => {
    expect(routeIntent('tolong ganti paket ke business').intent).toBe('CHANGE_PLAN');
  });

  it('BK-5. "pindah ke paket bisnis" → CHANGE_PLAN', () => {
    expect(routeIntent('pindah ke paket bisnis').intent).toBe('CHANGE_PLAN');
  });

  it('BK-6. "ganti langganan ke professional" → CHANGE_PLAN', () => {
    expect(routeIntent('ganti langganan ke professional').intent).toBe('CHANGE_PLAN');
  });

  it('BK-7. "change plan to pro" → CHANGE_PLAN', () => {
    expect(routeIntent('change plan to pro').intent).toBe('CHANGE_PLAN');
  });

  it('BK-8. tidak membajak rename: "ganti nama proyek menjadi Rumah Impian" → RENAME_PROJECT', () => {
    expect(routeIntent('ganti nama proyek menjadi Rumah Impian').intent).toBe('RENAME_PROJECT');
  });

  it('BK-9. tidak membajak saldo (P8, sudah ada): "sisa kredit saya" → CREDIT_BALANCE', () => {
    expect(routeIntent('sisa kredit saya').intent).toBe('CREDIT_BALANCE');
  });

  it('BK-10. tidak membajak top-up: "top up 500 kredit" → TOPUP_CREDIT', () => {
    expect(routeIntent('top up 500 kredit').intent).toBe('TOPUP_CREDIT');
  });
});

describe('CHANGE_PLAN: resolusi nama paket', () => {
  it('BK-11. pro/professional/starter/business/bisnis/free/gratis dikenali; "premium" tidak', () => {
    expect(resolveCreditPlanName('pro')).toBe('pro');
    expect(resolveCreditPlanName('professional')).toBe('pro');
    expect(resolveCreditPlanName('Professional (Pro)')).toBe('pro');
    expect(resolveCreditPlanName('starter')).toBe('starter');
    expect(resolveCreditPlanName('business')).toBe('business');
    expect(resolveCreditPlanName('bisnis')).toBe('business');
    expect(resolveCreditPlanName('free')).toBe('free');
    expect(resolveCreditPlanName('gratis')).toBe('free');
    expect(resolveCreditPlanName('premium')).toBeNull();
    expect(resolveCreditPlanName(undefined)).toBeNull();
    expect(resolveCreditPlanName('pro dong')).toBe('pro');
  });
});

describe('CHANGE_PLAN: handler', () => {
  it('BK-12. tanpa nama paket → daftar 4 paket + peringatan reset saldo + label simulasi', () => {
    const res = executeIntent('CHANGE_PLAN', undefined, baseCtx());
    expect(res.ok).toBe(true);
    expect(res.message).toContain('Free (Gratis)');
    expect(res.message).toContain('Starter');
    expect(res.message).toContain('Professional (Pro)');
    expect(res.message).toContain('Business');
    expect(res.message).toContain('simulasi');
    expect(res.message).toContain('mengatur ulang saldo simulasi');
  });

  it('BK-13. nama paket tak dikenal ("premium") → daftar paket, tanpa tebak', () => {
    const res = executeIntent('CHANGE_PLAN', 'premium', baseCtx());
    expect(res.ok).toBe(true);
    expect(res.message).toContain('Paket yang tersedia');
    expect(res.message).toContain('Professional (Pro)');
  });

  it('BK-14. sudah di paket itu → "tidak ada yang berubah", callback TIDAK dipanggil', () => {
    let calls = 0;
    const res = executeIntent('CHANGE_PLAN', 'pro', baseCtx({
      creditPlan: 'pro',
      changeCreditPlan: () => { calls++; return { ok: true, plan: 'pro' as CreditPlan, newBalance: 10000 }; },
    }));
    expect(calls).toBe(0);
    expect(res.ok).toBe(true);
    expect(res.message).toContain('sudah Professional (Pro)');
    expect(res.message).toContain('tidak ada yang berubah');
  });

  it('BK-15. paket aktif tak diketahui → ok:false (fail-closed: setPlan mengatur ulang saldo)', () => {
    let calls = 0;
    const ctx = baseCtx({ changeCreditPlan: () => { calls++; return { ok: true, plan: 'pro' as CreditPlan, newBalance: 10000 }; } });
    delete (ctx as Partial<ChatActionContext>).creditPlan;
    const res = executeIntent('CHANGE_PLAN', 'pro', ctx);
    expect(calls).toBe(0);
    expect(res.ok).toBe(false);
    expect(res.message).toContain('belum bisa melihat paket aktif');
  });

  it('BK-16. tanpa callback → ok:false, jujur "belum bisa"', () => {
    const res = executeIntent('CHANGE_PLAN', 'pro', baseCtx());
    expect(res.ok).toBe(false);
    expect(res.message).toContain('belum bisa mengganti paket');
    expect(res.message).toContain('Kredit AI');
  });

  it('BK-17. sukses → callback dipanggil dengan plan + pesan menyebut label, saldo baru, reset, SIMULASI', () => {
    const seen: CreditPlan[] = [];
    const res = executeIntent('CHANGE_PLAN', 'pro', baseCtx({
      creditPlan: 'free',
      changeCreditPlan: (plan) => {
        seen.push(plan);
        const r: ChangePlanResult = { ok: true, plan, newBalance: 10000 };
        return r;
      },
    }));
    expect(seen).toEqual(['pro']);
    expect(res.ok).toBe(true);
    expect(res.message).toContain('Paket simulasi diganti ke Professional (Pro)');
    expect(res.message).toContain('10.000 kredit');
    expect(res.message).toContain('top-up & bonus simulasi sebelumnya ikut terhapus');
    expect(res.message).toContain('SIMULASI');
    expect(res.message).toContain('tidak ada pembayaran');
  });

  it('BK-18. callback gagal + alasan → pesan menyebut alasan + paket aktif tetap', () => {
    const res = executeIntent('CHANGE_PLAN', 'business', baseCtx({
      creditPlan: 'starter',
      changeCreditPlan: () => ({ ok: false, plan: null, newBalance: null, reason: 'paket akun nyata tidak diganti lewat simulasi chat' }),
    }));
    expect(res.ok).toBe(false);
    expect(res.message).toContain('paket akun nyata tidak diganti lewat simulasi chat');
    expect(res.message).toContain('Paket aktif tetap Starter');
  });

  it('BK-19. callback melempar → ok:false, tanpa klaim sukses', () => {
    const res = executeIntent('CHANGE_PLAN', 'pro', baseCtx({
      changeCreditPlan: () => { throw new Error('boom'); },
    }));
    expect(res.ok).toBe(false);
    expect(res.message).toContain('Paket belum berganti');
  });

  it('BK-20. sukses tanpa saldo baru → arahkan ke "sisa kredit saya"', () => {
    const res = executeIntent('CHANGE_PLAN', 'starter', baseCtx({
      creditPlan: 'free',
      changeCreditPlan: (plan) => ({ ok: true, plan, newBalance: null }),
    }));
    expect(res.ok).toBe(true);
    expect(res.message).toContain('sisa kredit saya');
  });
});

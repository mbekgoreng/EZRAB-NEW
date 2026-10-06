/**
 * EZRAB Server-Side Key Pool (Phase 9.3 §8-§10)
 *
 * Holds the ONLY references to real API secrets — inside the server process.
 * The frontend and all HTTP responses only ever see key ALIASES
 * (e.g. "gemini-key-1"), never the secret itself.
 *
 * Selection considers: enabled, priority, cooldown, budget — not blind rotation.
 */

export interface KeyPoolEntry {
  alias: string; // safe identifier, e.g. 'zrouter-key-1'
  providerId: string;
  secret: string; // NEVER returned by any accessor other than getSecret()
  enabled: boolean;
  priority: number;
  monthlyBudgetUsd?: number;
  dailyBudgetUsd?: number;
  usageTodayUsd: number;
  usageMonthUsd: number;
  cooldownUntil?: number;
  failureCount: number;
  lastStatus?: 'SUCCESS' | 'RATE_LIMITED' | 'AUTH_ERROR' | 'TIMEOUT' | 'SERVER_ERROR';
}

export class ServerKeyPool {
  private entries: KeyPoolEntry[] = [];

  register(
    providerId: string,
    secrets: Array<string | undefined>,
    opts?: { monthlyBudgetUsd?: number; dailyBudgetUsd?: number }
  ): void {
    this.entries = this.entries.filter((e) => e.providerId !== providerId);
    let idx = 0;
    for (const secret of secrets) {
      if (!secret || secret.length <= 5) continue;
      idx += 1;
      this.entries.push({
        alias: `${providerId}-key-${idx}`,
        providerId,
        secret,
        enabled: true,
        priority: idx,
        monthlyBudgetUsd: opts?.monthlyBudgetUsd,
        dailyBudgetUsd: opts?.dailyBudgetUsd,
        usageTodayUsd: 0,
        usageMonthUsd: 0,
        failureCount: 0,
      });
    }
  }

  /** Select the healthiest usable key for a provider (priority, cooldown, budget). */
  selectKey(providerId: string, estimatedCostUsd = 0): KeyPoolEntry | null {
    const now = Date.now();
    const today = new Date().toISOString().slice(0, 10);
    const candidates = this.entries.filter((k) => {
      if (k.providerId !== providerId || !k.enabled) return false;
      if (k.cooldownUntil && k.cooldownUntil > now) return false;
      if (k.dailyBudgetUsd && k.usageTodayUsd + estimatedCostUsd > k.dailyBudgetUsd) return false;
      if (k.monthlyBudgetUsd && k.usageMonthUsd + estimatedCostUsd > k.monthlyBudgetUsd) return false;
      return true;
    });
    if (candidates.length === 0) {
      // Fallback: if all active keys for this provider are cooling down, use the one with earliest cooldown expiry
      const available = this.entries.filter((k) => k.providerId === providerId && k.enabled);
      if (available.length > 0) {
        available.sort((a, b) => (a.cooldownUntil || 0) - (b.cooldownUntil || 0));
        return available[0];
      }
      return null;
    }
    candidates.sort(
      (a, b) =>
        a.priority - b.priority ||
        (a.usageTodayUsd || 0) - (b.usageTodayUsd || 0)
    );
    return candidates[0];
  }

  /** Resolve an alias back to its secret — server-internal only. */
  getSecret(alias: string): string | null {
    return this.entries.find((e) => e.alias === alias)?.secret ?? null;
  }

  getAlias(providerId: string, index = 1): string | null {
    return this.entries.find((e) => e.providerId === providerId)?.alias ?? null;
  }

  recordUsage(alias: string, costUsd: number): void {
    const k = this.entries.find((e) => e.alias === alias);
    if (!k) return;
    // reset daily counters lazily on first use of a new day
    const today = new Date().toISOString().slice(0, 10);
    if ((k as any)._usageDay !== today) {
      (k as any)._usageDay = today;
      k.usageTodayUsd = 0;
    }
    k.usageTodayUsd += costUsd;
    k.usageMonthUsd += costUsd;
  }

  recordFailure(alias: string, status: KeyPoolEntry['lastStatus'], cooldownMs = 60000): void {
    const k = this.entries.find((e) => e.alias === alias);
    if (!k) return;
    k.lastStatus = status;
    k.failureCount += 1;
    if (status === 'RATE_LIMITED' || status === 'AUTH_ERROR' || status === 'SERVER_ERROR' || status === 'TIMEOUT') {
      k.cooldownUntil = Date.now() + cooldownMs;
    } else if (k.failureCount >= 2) {
      k.cooldownUntil = Date.now() + cooldownMs;
    }
  }

  recordSuccess(alias: string): void {
    const k = this.entries.find((e) => e.alias === alias);
    if (!k) return;
    k.lastStatus = 'SUCCESS';
    k.failureCount = 0;
    k.cooldownUntil = undefined;
  }

  /** Sanitized, client-safe view (never contains secrets). */
  getSafeStatus(): Array<Omit<KeyPoolEntry, 'secret'>> {
    return this.entries.map(({ secret, ...safe }) => safe);
  }

  activeKeyCount(providerId: string): number {
    return this.entries.filter((e) => e.providerId === providerId).length;
  }
}

export const serverKeyPool = new ServerKeyPool();

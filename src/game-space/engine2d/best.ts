/**
 * EZRAB Game Space 2D — best-score persistence (src/game-space/engine2d/best.ts)
 * localStorage-backed, guarded for non-browser / private-mode environments.
 */

const mem = new Map<string, string>();

function lsGet(key: string): string | null {
  try {
    const v = localStorage.getItem(key);
    if (v !== null) return v;
  } catch {
    /* ignore */
  }
  return mem.get(key) ?? null;
}

function lsSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
  mem.set(key, value);
}

/** Namespaced key: `gs2d:<slug>:<name>` */
export const bestKey = (slug: string, name: string): string => `gs2d:${slug}:${name}`;

export function getBest(key: string, fallback = 0): number {
  const raw = lsGet(key);
  const n = raw === null ? NaN : Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/** Store max(value, previous). Returns the stored (best) value. */
export function setBest(key: string, value: number): number {
  const best = Math.max(getBest(key, 0), value);
  lsSet(key, String(best));
  return best;
}

export function getJson<T>(key: string, fallback: T): T {
  const raw = lsGet(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function setJson(key: string, value: unknown): void {
  try {
    lsSet(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

/**
 * Tembak Paku — nail gun ke papan triplek. Pure ballistics (no DOM).
 *
 * Ruang virtual setinggi VH unit. Paku ditembakkan horizontal dari kiri;
 * gravitasi menariknya ke bawah, angin (tiupan vertikal) mendorongnya.
 * Tiap ronde papan triplek makin jauh (digambar & hitbox makin kecil).
 */

export const VH = 600;
export const NAIL_SPEED = 950; // unit/detik
export const GRAVITY = 640; // unit/detik^2
export const WIND_ACCEL = 150; // percepatan per 1.0 angin
export const NAILS_PER_ROUND = 5;
export const MAX_ROUNDS = 5;

export type Rng = () => number;

export interface RoundSpec {
  level: number; // 0-based
  distance: number; // jarak tembak (unit)
  targetY: number; // tengah papan (0..VH)
  wind: number; // -windMax..windMax (+ = tiupan ke bawah)
  windMax: number;
  nails: number;
}

export function roundSpec(level: number, rng: Rng = Math.random): RoundSpec {
  const distance = 300 + level * 70;
  const targetY = VH * (0.3 + rng() * 0.4);
  const windMax = Math.min(2.4, 0.5 + level * 0.3);
  const wind = (rng() * 2 - 1) * windMax;
  return { level, distance, targetY, wind, windMax, nails: NAILS_PER_ROUND };
}

/** Skala papan: makin jauh makin kecil (visual + hitbox). */
export function targetScale(distance: number): number {
  return Math.max(0.55, Math.min(1, 380 / distance));
}

/** Waktu tempuh paku sampai papan (detik). */
export function flightTime(distance: number): number {
  return distance / NAIL_SPEED;
}

/** Titik jatuh gravitasi bila membidik datar — untuk tuning & tes. */
export function dropAt(distance: number): number {
  const t = flightTime(distance);
  return 0.5 * GRAVITY * t * t;
}

export interface ShotResult {
  hitY: number; // posisi paku saat mencapai papan
  ring: number; // 0 = meleset, 1..4 (4 = tepat tengah)
  score: number;
  bullseye: boolean;
}

const RING_SCORE = [0, 10, 30, 50, 100];
const RING_RADII = [54, 40, 27, 14]; // ring 1..4, luar -> dalam

export function fireShot(aimY: number, spec: RoundSpec): ShotResult {
  const t = flightTime(spec.distance);
  const drop = 0.5 * GRAVITY * t * t;
  const drift = 0.5 * spec.wind * WIND_ACCEL * t * t;
  const hitY = aimY + drop + drift;
  const scale = targetScale(spec.distance);
  const dy = Math.abs(hitY - spec.targetY);
  let ring = 0;
  for (let i = RING_RADII.length - 1; i >= 0; i -= 1) {
    if (dy <= RING_RADII[i] * scale) {
      ring = i + 1;
      break;
    }
  }
  return { hitY, ring, score: RING_SCORE[ring], bullseye: ring === 4 };
}

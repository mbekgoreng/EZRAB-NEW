/**
 * ArcadeEmojiCatcher ("Tangkap Helm") — pure logic.
 * Tangkap helm & APD yang jatuh dari lantai atas dengan keranjang proyek,
 * hindari bata yang ikut jatuh. Level naik tiap 12 tangkapan.
 */

export type ItemKind = 'helm' | 'bonus' | 'bata';

export interface FallingItem {
  kind: ItemKind;
  emoji: string; // warisan data lama — komponen TIDAK lagi menggambar dari emoji (Gelombang 5: prosedural per kind+variant)
  variant: number; // indeks varian visual prosedural (helm: 0..4, bonus: 0..1, bata: 0)
  x: number; // posisi horizontal (px, CSS)
  y: number; // posisi vertikal (px, CSS)
  vy: number; // kecepatan jatuh px/detik
  r: number; // radius tabrakan
  points: number;
  wobble: number; // fase goyangan horizontal
  born: number; // timestamp lahir (ms) — untuk variasi
}

export const CATCHES_PER_LEVEL = 12;
export const MAX_LIVES = 3;

/** Helm & APD yang wajib ditangkap (10 poin). */
const HELMS = ['⛑️', '🦺', '🧤', '🥾', '🔨'];
/** Bonus langka dari mandor (50 poin). */
const BONUSES = ['⭐', '🏅'];
/** Bahaya: bata jatuh dari lantai atas! */
const BRICK = '🧱';

/** Level dari jumlah tangkapan: tiap 12 tangkapan naik 1 level. */
export function levelFor(caught: number): number {
  return 1 + Math.floor(Math.max(0, caught) / CATCHES_PER_LEVEL);
}

/** Progres tangkapan di dalam level berjalan: 0..CATCHES_PER_LEVEL-1 (untuk HUD). */
export function progressInLevel(caught: number): number {
  return Math.max(0, caught) % CATCHES_PER_LEVEL;
}

/** Berapa tangkapan lagi menuju level berikutnya (untuk HUD). */
export function catchesToNextLevel(caught: number): number {
  return CATCHES_PER_LEVEL - progressInLevel(caught);
}

/** Fraksi progres level 0..1 (untuk bar progres HUD). */
export function levelProgressFraction(caught: number): number {
  return progressInLevel(caught) / CATCHES_PER_LEVEL;
}

/** Kecepatan jatuh dasar (px/detik) — naik per level, dengan variasi rng. */
export function fallSpeed(level: number, rng: () => number): number {
  return (150 + level * 42) * (0.85 + rng() * 0.3);
}

/** Interval spawn (detik) — makin cepat per level, floor 0.32s. */
export function spawnInterval(level: number): number {
  return Math.max(0.32, 1.05 - level * 0.09);
}

/** Peluang kemunculan per jenis pada level tertentu. */
export function kindFor(level: number, rng: () => number): ItemKind {
  const brickP = Math.min(0.28, 0.10 + level * 0.022);
  const bonusP = 0.10;
  const r = rng();
  if (r < brickP) return 'bata';
  if (r < brickP + bonusP) return 'bonus';
  return 'helm';
}

export function pointsFor(kind: ItemKind): number {
  if (kind === 'bonus') return 50;
  if (kind === 'helm') return 10;
  return 0;
}

/** Buat satu item jatuh di posisi x acak dalam lebar arena. */
export function spawnItem(
  rng: () => number,
  level: number,
  width: number,
  yStart: number,
  now: number,
): FallingItem {
  const kind = kindFor(level, rng);
  const variant =
    kind === 'bata' ? 0
    : kind === 'bonus' ? Math.floor(rng() * BONUSES.length)
    : Math.floor(rng() * HELMS.length);
  const emoji =
    kind === 'bata' ? BRICK
    : kind === 'bonus' ? BONUSES[variant]
    : HELMS[variant];
  const r = kind === 'bonus' ? 17 : 15;
  return {
    kind,
    emoji,
    variant,
    x: r + rng() * Math.max(1, width - r * 2),
    y: yStart,
    vy: fallSpeed(level, rng),
    r,
    points: pointsFor(kind),
    wobble: rng() * Math.PI * 2,
    born: now,
  };
}

/** Apakah item menyentuh keranjang (kotak di basketY dengan lebar basketW). */
export function hitsBasket(
  item: FallingItem,
  basketX: number,
  basketW: number,
  basketY: number,
  basketH: number,
): boolean {
  const hw = basketW / 2;
  return (
    item.x > basketX - hw - item.r * 0.4 &&
    item.x < basketX + hw + item.r * 0.4 &&
    item.y + item.r > basketY &&
    item.y - item.r < basketY + basketH
  );
}

/** Apakah item sudah jatuh melewati bawah layar. */
export function isMissed(item: FallingItem, height: number): boolean {
  return item.y - item.r > height;
}

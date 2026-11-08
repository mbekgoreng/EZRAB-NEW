/**
 * Selamatkan Mandor — pure game logic (no DOM, no window).
 * Save-the-crew style: hazards rain from above AND fly in from the sides
 * in waves; the player draws ONE polyline of marker ink that behaves like
 * a physical beam — long unsupported spans sag/flex and break under load,
 * so real solutions are cages, ramps and supported roofs, not one flat
 * umbrella sketch. Some levels protect two workers, and switch levels are
 * lost when a hazard reaches the red emergency switch.
 */

export type FallKind = 'bata' | 'palu' | 'ember' | 'pipa' | 'drum';

export interface Vec {
  x: number;
  y: number;
}

export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  kind: FallKind;
  rot: number;
  spin: number;
  landed: boolean;
  landT: number;
  /** spawn origin metadata (side-flyers bounce differently from rain) */
  origin: 'top' | 'left' | 'right';
  /** light debris drifts with the level wind a little (multi-direction) */
  drift: number;
  /** ember (cement bucket) disintegrates harmlessly on hard ground impact */
  fragile: boolean;
  /** puing runtuhan: irregular, slower spin, short lived visual */
  puing: boolean;
}

export interface SpawnEvent {
  /** seconds after level start */
  at: number;
  /** x position (fraction of width 0..1, converted with W) */
  xf: number;
  kind: FallKind;
  /** initial fall speed px/s (top spawns; 0/unused for side-flyers) */
  vy0?: number;
  /**
   * spawn origin: 'top' (default) drops from the sky; 'left'/'right'
   * fly in horizontally from a screen edge toward the site.
   */
  from?: 'top' | 'left' | 'right';
  /** side-flyers: height of the flight path (fraction of H, 0..1) */
  yf?: number;
  /** side-flyers: horizontal flight speed px/s */
  vx0?: number;
}

/** A static rect obstacle standing on the ground (platform / scaffold). */
export interface PlatformDef {
  /** x center (fraction of width) */
  xf: number;
  /** width px */
  w: number;
  /** height px (sits on the ground, top at groundY - h) */
  h: number;
  /** crumbles away `crumbleAfter` seconds after first line/body contact */
  crumble?: boolean;
  crumbleAfter?: number;
  label?: string;
}

export interface SwitchDef {
  /** x center (fraction of width) */
  xf: number;
}

export interface LevelDef {
  name: string;
  sub: string;
  /** level duration in seconds */
  duration: number;
  /** total drawable line length in px */
  ink: number;
  gravity: number;
  spawns: SpawnEvent[];
  /** extra protectee positions (fractions of width) besides the foreman */
  extraProtectees?: number[];
  /** crumbling / static platforms standing in the scene */
  platforms?: PlatformDef[];
  /** protect-the-switch objective: a hazard touching it ends the level */
  switchDef?: SwitchDef;
  /** NEW mechanic chips for this level, shown on the intro card */
  features?: string[];
}

export const KIND_R: Record<FallKind, number> = {
  bata: 15, palu: 17, ember: 19, pipa: 16, drum: 21,
};
export const KIND_NAME: Record<FallKind, string> = {
  bata: 'bata',
  palu: 'palu',
  ember: 'ember semen',
  pipa: 'pipa besi',
  drum: 'drum oli',
};

/** fall-speed class: light debris drifts with wind, heavy stays ballistic */
export const KIND_DRIFT: Record<FallKind, number> = {
  bata: 0, palu: 0, ember: 0, pipa: 0.35, drum: 0,
};

/**
 * Telegraph lead time (seconds): how long before a spawn the warning
 * shadow + falling whistle appear. Gives the player time to anticipate.
 */
export const WARN_LEAD = 1.2;

/**
 * Fairness rule: no TOP body may spawn directly above any protectee
 * (|xf - protecteeXf| < HEAD_ZONE) within the first FAIR_START seconds.
 */
export const FAIR_START = 2.0;
export const HEAD_ZONE = 0.09;

/* ---------------- line physics: the drawn line is a beam ----------------
 * The smoothed polyline is re-chunked into rigid segments of ~SEG_LEN px.
 * A segment is SUPPORTED when one of its ends rests on something firm:
 * the ground, a platform top, or within ANCHOR_ZONE px above a protectee
 * (a pillar drawn down next to a worker counts as propped on his zone).
 * An unsupported segment must carry everything resting on it through its
 * neighbours; when the accumulated point load exceeds the beam strength
 * it FLEXES (sags) and, past the break threshold, SNAPS into two rigid
 * chunks that fall and fade. Longer spans flex more — a wide flat
 * umbrella accumulates load at its middle and collapses, while short
 * spans, cages and mid-supported bridges survive.
 */
export const SEG_LEN = 40;
export const ANCHOR_ZONE = 46;
export const BEAM_FLEX = 10; // sag px per load unit per span factor
export const BREAK_LOAD = 2.05; // load units at the weakest point → snap
export const SEG_LOAD_TRANSFER = 0.55; // neighbour carries part of the load
/**
 * Segments touching a SUPPORTED segment on either side count as propped
 * (a beam bolted to a pillar carries its first span). Only segments at
 * distance ≥2 from every support are truly free spans.
 */
export const PROPAGATE_SUPPORT = 1;

/** how heavy a resting body presses on the line, by kind */
export const KIND_WEIGHT: Record<FallKind, number> = {
  bata: 0.75, palu: 0.7, pipa: 0.55, ember: 1.35, drum: 1.5,
};

export interface LineSeg {
  a: Vec;
  b: Vec;
  /** accumulated resting load (recomputed every step) */
  load: number;
  /** accumulated impact stress from hard hits (decays) */
  impact: number;
  /** 0 = rigid, 1 = about to snap (visual sag + strain) */
  strain: number;
  /** resting firmly on ground/platform/anchor zone */
  supported: boolean;
  broken: boolean;
}

export interface Debris {
  /** a snapped chunk of line falling as rigid debris */
  a: Vec;
  b: Vec;
  vx: number;
  vy: number;
  rot: number;
  cx: number;
  cy: number;
  /** remaining fade time (seconds) */
  life: number;
  kind: 'line';
}

/** Static platform instance with crumble state. */
export interface PlatformState {
  def: PlatformDef;
  x: number;
  y: number; // top y
  w: number;
  h: number;
  /** seconds of accumulated contact; -1 = untouched */
  contactT: number;
  gone: boolean;
}

export interface Protectee {
  x: number;
  y: number;
  r: number;
  role: 'mandor' | 'tukang';
}

/** All protectee x-fractions for a level (foreman centred + extras). */
export function protecteeXfs(level: LevelDef): number[] {
  return [0.5, ...(level.extraProtectees ?? [])];
}

/* ---------------- 15 restructured levels ----------------
 * Escalation: L1-3 classic rain (learning, gradually faster);
 * L4 wind drift; L5 platform + first crumbling scaffold (line physics
 * introduced gently); L6 side-flyers; L7 crumbling bridge over a gap
 * zone; L8 wind + side mix; L9 TWO protectees; L10 switch objective;
 * L11 crumbling platforms + heavy rain; L12 two protectees + side;
 * L13 switch + crumbling + side; L14 two protectees + switch + storm;
 * L15 everything, longest waves (~15 s hazard phases inside 26 s).
 */
export const LEVELS: LevelDef[] = [
  {
    name: 'Apel Pagi',
    sub: 'Satu bata nyasar. Gambar garis di atas helm mandor.',
    duration: 10, ink: 460, gravity: 1300,
    spawns: [
      { at: 1.5, xf: 0.35, kind: 'bata', vy0: 120 },
      { at: 4.5, xf: 0.42, kind: 'bata', vy0: 120 },
      { at: 7.0, xf: 0.58, kind: 'bata', vy0: 120 },
    ],
  },
  {
    name: 'Shift Pagi',
    sub: 'Bata mulai berani jatuh lebih cepat.',
    duration: 12, ink: 480, gravity: 1350,
    spawns: [
      { at: 1.0, xf: 0.65, kind: 'bata', vy0: 150 },
      { at: 3.5, xf: 0.38, kind: 'bata', vy0: 150 },
      { at: 6.0, xf: 0.62, kind: 'bata', vy0: 150 },
      { at: 8.5, xf: 0.5, kind: 'bata', vy0: 170 },
    ],
  },
  {
    name: 'Tukang Lupa Helm',
    sub: 'Dua bata sekaligus. Untung mandor pakai helm.',
    duration: 13, ink: 500, gravity: 1400,
    spawns: [
      { at: 1.0, xf: 0.35, kind: 'bata', vy0: 160 },
      { at: 2.5, xf: 0.35, kind: 'bata', vy0: 160 },
      { at: 4.0, xf: 0.65, kind: 'bata', vy0: 160 },
      { at: 6.5, xf: 0.5, kind: 'bata', vy0: 190 },
      { at: 8.5, xf: 0.42, kind: 'bata', vy0: 190 },
      { at: 10.5, xf: 0.58, kind: 'bata', vy0: 190 },
    ],
  },
  {
    name: 'Angin Kencang',
    sub: 'Pipa ringan terbawa angin menyamping. Atap miring lebih aman dari atap datar.',
    duration: 15, ink: 560, gravity: 1450,
    features: ['Angin menyamping'],
    spawns: [
      { at: 1.0, xf: 0.6, kind: 'palu', vy0: 150 },
      { at: 2.6, xf: 0.3, kind: 'pipa', vy0: 120 },
      { at: 4.2, xf: 0.62, kind: 'bata', vy0: 170 },
      { at: 5.8, xf: 0.72, kind: 'pipa', vy0: 120 },
      { at: 7.4, xf: 0.4, kind: 'pipa', vy0: 120 },
      { at: 9.0, xf: 0.5, kind: 'palu', vy0: 170 },
      { at: 10.6, xf: 0.28, kind: 'pipa', vy0: 120 },
      { at: 12.2, xf: 0.55, kind: 'bata', vy0: 190 },
    ],
  },
  {
    name: 'Perancah Tua',
    sub: 'Perancah kayu bisa jadi tumpuan garis — tapi yang tua akan runtuh kalau dibebani terus.',
    duration: 16, ink: 560, gravity: 1500,
    features: ['Fisika garis: bentang panjang bisa patah', 'Perancah runtuh'],
    platforms: [
      { xf: 0.30, w: 64, h: 120, label: 'Perancah' },
      { xf: 0.70, w: 64, h: 120, crumble: true, crumbleAfter: 2.2, label: 'Perancah tua' },
    ],
    spawns: [
      { at: 1.0, xf: 0.38, kind: 'bata', vy0: 170 },
      { at: 3.0, xf: 0.62, kind: 'bata', vy0: 170 },
      { at: 5.0, xf: 0.5, kind: 'ember', vy0: 140 },
      { at: 7.0, xf: 0.42, kind: 'palu', vy0: 165 },
      { at: 9.0, xf: 0.58, kind: 'ember', vy0: 150 },
      { at: 11.0, xf: 0.35, kind: 'bata', vy0: 190 },
      { at: 13.0, xf: 0.65, kind: 'bata', vy0: 190 },
    ],
  },
  {
    name: 'Tetangga Melempar',
    sub: 'Proyek sebelah melempar bata DARI SAMPING. Payung saja tidak cukup — bikin dinding atau sangkar!',
    duration: 17, ink: 620, gravity: 1550,
    features: ['Bahaya dari samping'],
    spawns: [
      { at: 1.0, xf: 0.62, kind: 'bata', vy0: 180 },
      { at: 2.8, kind: 'bata', from: 'left', yf: 0.74, vx0: 300, xf: 0 },
      { at: 4.6, xf: 0.4, kind: 'palu', vy0: 175 },
      { at: 6.2, kind: 'bata', from: 'right', yf: 0.74, vx0: 300, xf: 1 },
      { at: 8.0, xf: 0.5, kind: 'ember', vy0: 150 },
      { at: 9.6, kind: 'palu', from: 'left', yf: 0.78, vx0: 320, xf: 0 },
      { at: 11.4, xf: 0.42, kind: 'bata', vy0: 200 },
      { at: 13.0, kind: 'bata', from: 'right', yf: 0.70, vx0: 320, xf: 1 },
      { at: 14.6, xf: 0.55, kind: 'bata', vy0: 205 },
    ],
  },
  {
    name: 'Jembatan Darurat',
    sub: 'Perancah di tengah runtuh pelan-pelan. Garismu butuh tumpuan yang tidak ikut runtuh.',
    duration: 18, ink: 620, gravity: 1600,
    features: ['Perancah runtuh', 'Jembatan butuh tumpuan tengah'],
    platforms: [
      { xf: 0.5, w: 70, h: 132, crumble: true, crumbleAfter: 2.6, label: 'Perancah tengah' },
    ],
    spawns: [
      { at: 1.0, xf: 0.35, kind: 'bata', vy0: 190 },
      { at: 3.0, xf: 0.65, kind: 'bata', vy0: 190 },
      { at: 5.0, xf: 0.5, kind: 'ember', vy0: 155 },
      { at: 7.0, xf: 0.42, kind: 'palu', vy0: 180 },
      { at: 9.0, xf: 0.58, kind: 'ember', vy0: 160 },
      { at: 11.0, xf: 0.38, kind: 'bata', vy0: 210 },
      { at: 13.0, xf: 0.62, kind: 'bata', vy0: 210 },
      { at: 15.0, xf: 0.5, kind: 'palu', vy0: 190 },
    ],
  },
  {
    name: 'Badai Samping',
    sub: 'Angin, lemparan samping, dan hujan bata sekaligus. Sangkar adalah temanmu.',
    duration: 19, ink: 680, gravity: 1700,
    features: ['Angin menyamping', 'Bahaya dari samping'],
    spawns: [
      { at: 0.9, xf: 0.3, kind: 'pipa', vy0: 130 },
      { at: 2.2, kind: 'bata', from: 'left', yf: 0.74, vx0: 310, xf: 0 },
      { at: 3.6, xf: 0.68, kind: 'bata', vy0: 210 },
      { at: 5.0, kind: 'palu', from: 'right', yf: 0.78, vx0: 330, xf: 1 },
      { at: 6.4, xf: 0.5, kind: 'ember', vy0: 165 },
      { at: 7.8, xf: 0.72, kind: 'pipa', vy0: 130 },
      { at: 9.2, kind: 'bata', from: 'left', yf: 0.70, vx0: 330, xf: 0 },
      { at: 10.6, xf: 0.42, kind: 'bata', vy0: 220 },
      { at: 12.0, xf: 0.58, kind: 'palu', vy0: 195 },
      { at: 13.4, kind: 'ember', from: 'right', yf: 0.76, vx0: 320, xf: 1 },
      { at: 14.8, xf: 0.5, kind: 'bata', vy0: 225 },
      { at: 16.2, xf: 0.35, kind: 'pipa', vy0: 135 },
    ],
  },
  {
    name: 'Dua Kepala',
    sub: 'Tukang baru ikut di lapangan. Lindungi DUA orang sekaligus — sangkar lebar atau dua atap kecil.',
    duration: 19, ink: 760, gravity: 1650,
    features: ['Dua orang dilindungi'],
    extraProtectees: [0.22],
    spawns: [
      { at: 1.0, xf: 0.24, kind: 'bata', vy0: 185 },
      { at: 2.6, xf: 0.55, kind: 'bata', vy0: 185 },
      { at: 4.2, xf: 0.3, kind: 'palu', vy0: 175 },
      { at: 5.8, xf: 0.62, kind: 'ember', vy0: 155 },
      { at: 7.4, xf: 0.2, kind: 'bata', vy0: 205 },
      { at: 9.0, xf: 0.48, kind: 'palu', vy0: 185 },
      { at: 10.6, xf: 0.68, kind: 'bata', vy0: 205 },
      { at: 12.2, xf: 0.26, kind: 'ember', vy0: 160 },
      { at: 13.8, xf: 0.55, kind: 'ember', vy0: 160 },
      { at: 15.4, xf: 0.4, kind: 'bata', vy0: 215 },
      { at: 16.8, xf: 0.6, kind: 'bata', vy0: 215 },
    ],
  },
  {
    name: 'Sakelar Merah',
    sub: 'Jangan biarkan SATU benda pun menyentuh sakelar darurat di kanan — atau genset meledak.',
    duration: 19, ink: 680, gravity: 1700,
    features: ['Lindungi sakelar darurat'],
    switchDef: { xf: 0.86 },
    spawns: [
      { at: 1.0, xf: 0.36, kind: 'bata', vy0: 200 },
      { at: 2.6, xf: 0.78, kind: 'bata', vy0: 200 },
      { at: 4.2, kind: 'palu', from: 'right', yf: 0.72, vx0: 330, xf: 1 },
      { at: 5.8, xf: 0.84, kind: 'ember', vy0: 160 },
      { at: 7.4, xf: 0.45, kind: 'palu', vy0: 190 },
      { at: 9.0, xf: 0.8, kind: 'bata', vy0: 215 },
      { at: 10.6, kind: 'bata', from: 'right', yf: 0.78, vx0: 340, xf: 1 },
      { at: 12.2, xf: 0.88, kind: 'palu', vy0: 200 },
      { at: 13.8, xf: 0.52, kind: 'ember', vy0: 170 },
      { at: 15.4, xf: 0.82, kind: 'bata', vy0: 225 },
      { at: 16.8, kind: 'palu', from: 'right', yf: 0.74, vx0: 350, xf: 1 },
    ],
  },
  {
    name: 'Perancah Runtuh',
    sub: 'Dua perancah tua menopang langit-langit kerja. Semua beban berat — garis panjang tanpa tumpuan akan patah.',
    duration: 21, ink: 720, gravity: 1800,
    features: ['Perancah runtuh', 'Fisika garis: bentang panjang bisa patah'],
    platforms: [
      { xf: 0.28, w: 64, h: 128, crumble: true, crumbleAfter: 2.0, label: 'Perancah tua' },
      { xf: 0.72, w: 64, h: 128, crumble: true, crumbleAfter: 2.0, label: 'Perancah tua' },
    ],
    spawns: [
      { at: 0.9, xf: 0.4, kind: 'bata', vy0: 220 },
      { at: 2.2, xf: 0.6, kind: 'bata', vy0: 220 },
      { at: 3.6, xf: 0.5, kind: 'drum', vy0: 175 },
      { at: 5.2, xf: 0.35, kind: 'ember', vy0: 170 },
      { at: 6.8, xf: 0.65, kind: 'ember', vy0: 170 },
      { at: 8.4, xf: 0.45, kind: 'palu', vy0: 205 },
      { at: 10.0, xf: 0.55, kind: 'drum', vy0: 180 },
      { at: 11.6, xf: 0.38, kind: 'bata', vy0: 235 },
      { at: 13.2, xf: 0.62, kind: 'bata', vy0: 235 },
      { at: 14.8, xf: 0.5, kind: 'ember', vy0: 180 },
      { at: 16.4, xf: 0.42, kind: 'palu', vy0: 215 },
      { at: 18.2, xf: 0.58, kind: 'drum', vy0: 185 },
    ],
  },
  {
    name: 'Pasukan Dua Baris',
    sub: 'Dua orang, lemparan dari dua sisi. Gambar sangkar untuk masing-masing atau satu benteng besar.',
    duration: 22, ink: 880, gravity: 1850,
    features: ['Dua orang dilindungi', 'Bahaya dari samping'],
    extraProtectees: [0.22],
    spawns: [
      { at: 0.9, xf: 0.26, kind: 'bata', vy0: 225 },
      { at: 2.2, kind: 'bata', from: 'left', yf: 0.74, vx0: 320, xf: 0 },
      { at: 3.6, xf: 0.55, kind: 'ember', vy0: 175 },
      { at: 5.0, kind: 'palu', from: 'right', yf: 0.76, vx0: 340, xf: 1 },
      { at: 6.4, xf: 0.24, kind: 'palu', vy0: 210 },
      { at: 7.8, xf: 0.62, kind: 'bata', vy0: 235 },
      { at: 9.2, kind: 'ember', from: 'left', yf: 0.72, vx0: 330, xf: 0 },
      { at: 10.6, xf: 0.45, kind: 'bata', vy0: 240 },
      { at: 12.0, xf: 0.3, kind: 'ember', vy0: 180 },
      { at: 13.4, kind: 'bata', from: 'right', yf: 0.74, vx0: 350, xf: 1 },
      { at: 14.8, xf: 0.58, kind: 'palu', vy0: 220 },
      { at: 16.2, xf: 0.68, kind: 'bata', vy0: 245 },
      { at: 17.6, kind: 'palu', from: 'left', yf: 0.78, vx0: 350, xf: 1 },
      { at: 19.0, xf: 0.4, kind: 'ember', vy0: 185 },
      { at: 20.2, xf: 0.55, kind: 'bata', vy0: 250 },
    ],
  },
  {
    name: 'Genset Terancam',
    sub: 'Sakelar, perancah runtuh, dan lemparan samping. Prioritaskan: sakelar dulu, baru kepala.',
    duration: 22, ink: 820, gravity: 1900,
    features: ['Lindungi sakelar darurat', 'Perancah runtuh', 'Bahaya dari samping'],
    extraProtectees: [],
    switchDef: { xf: 0.86 },
    platforms: [
      { xf: 0.34, w: 64, h: 124, crumble: true, crumbleAfter: 2.2, label: 'Perancah tua' },
    ],
    spawns: [
      { at: 0.9, xf: 0.38, kind: 'bata', vy0: 235 },
      { at: 2.2, xf: 0.8, kind: 'bata', vy0: 235 },
      { at: 3.6, kind: 'palu', from: 'right', yf: 0.72, vx0: 340, xf: 1 },
      { at: 5.0, xf: 0.86, kind: 'drum', vy0: 180 },
      { at: 6.4, xf: 0.44, kind: 'ember', vy0: 180 },
      { at: 7.8, kind: 'bata', from: 'right', yf: 0.78, vx0: 350, xf: 1 },
      { at: 9.2, xf: 0.76, kind: 'palu', vy0: 220 },
      { at: 10.6, xf: 0.52, kind: 'bata', vy0: 245 },
      { at: 12.0, kind: 'ember', from: 'left', yf: 0.74, vx0: 330, xf: 0 },
      { at: 13.4, xf: 0.84, kind: 'ember', vy0: 185 },
      { at: 14.8, xf: 0.6, kind: 'palu', vy0: 225 },
      { at: 16.2, kind: 'palu', from: 'right', yf: 0.74, vx0: 360, xf: 1 },
      { at: 17.6, xf: 0.48, kind: 'bata', vy0: 250 },
      { at: 19.0, xf: 0.82, kind: 'drum', vy0: 190 },
      { at: 20.2, xf: 0.55, kind: 'ember', vy0: 190 },
    ],
  },
  {
    name: 'Badai Total',
    sub: 'Dua orang DAN sakelar. Gelombang bahaya hampir tanpa jeda — sangkar ganda adalah satu-satunya jalan.',
    duration: 24, ink: 980, gravity: 2000,
    features: ['Dua orang dilindungi', 'Lindungi sakelar darurat', 'Bahaya dari samping'],
    extraProtectees: [0.22],
    switchDef: { xf: 0.86 },
    spawns: [
      { at: 0.8, xf: 0.26, kind: 'bata', vy0: 245 },
      { at: 1.9, xf: 0.62, kind: 'bata', vy0: 245 },
      { at: 3.0, kind: 'bata', from: 'left', yf: 0.74, vx0: 340, xf: 0 },
      { at: 4.1, xf: 0.82, kind: 'ember', vy0: 185 },
      { at: 5.2, xf: 0.45, kind: 'palu', vy0: 225 },
      { at: 6.3, kind: 'palu', from: 'right', yf: 0.76, vx0: 350, xf: 1 },
      { at: 7.4, xf: 0.24, kind: 'ember', vy0: 190 },
      { at: 8.5, xf: 0.62, kind: 'drum', vy0: 190 },
      { at: 9.6, kind: 'bata', from: 'left', yf: 0.72, vx0: 350, xf: 0 },
      { at: 10.7, xf: 0.5, kind: 'bata', vy0: 255 },
      { at: 11.8, xf: 0.86, kind: 'palu', vy0: 230 },
      { at: 12.9, kind: 'ember', from: 'right', yf: 0.74, vx0: 350, xf: 1 },
      { at: 14.0, xf: 0.34, kind: 'bata', vy0: 260 },
      { at: 15.1, xf: 0.58, kind: 'ember', vy0: 195 },
      { at: 16.2, kind: 'palu', from: 'left', yf: 0.78, vx0: 360, xf: 0 },
      { at: 17.3, xf: 0.8, kind: 'drum', vy0: 195 },
      { at: 18.4, xf: 0.42, kind: 'bata', vy0: 265 },
      { at: 19.5, kind: 'bata', from: 'right', yf: 0.72, vx0: 360, xf: 1 },
      { at: 20.6, xf: 0.52, kind: 'palu', vy0: 235 },
      { at: 21.7, xf: 0.28, kind: 'ember', vy0: 190 },
      { at: 22.8, xf: 0.6, kind: 'bata', vy0: 270 },
    ],
  },
  {
    name: 'Serah Terima Akbar',
    sub: 'Level terakhir: semua mekanik, gelombang terpanjang. Buktikan spidolmu bukan cuma payung.',
    duration: 26, ink: 1040, gravity: 2100,
    features: ['Dua orang dilindungi', 'Lindungi sakelar darurat', 'Perancah runtuh', 'Bahaya dari samping', 'Angin menyamping'],
    extraProtectees: [0.22],
    switchDef: { xf: 0.86 },
    platforms: [
      { xf: 0.36, w: 64, h: 126, crumble: true, crumbleAfter: 2.4, label: 'Perancah tua' },
    ],
    spawns: [
      { at: 0.8, xf: 0.3, kind: 'pipa', vy0: 140 },
      { at: 1.8, xf: 0.63, kind: 'bata', vy0: 255 },
      { at: 2.8, kind: 'bata', from: 'left', yf: 0.74, vx0: 350, xf: 0 },
      { at: 3.9, xf: 0.84, kind: 'ember', vy0: 195 },
      { at: 5.0, xf: 0.42, kind: 'palu', vy0: 235 },
      { at: 6.1, kind: 'drum', from: 'right', yf: 0.78, vx0: 340, xf: 1 },
      { at: 7.2, xf: 0.24, kind: 'ember', vy0: 200 },
      { at: 8.3, xf: 0.6, kind: 'drum', vy0: 200 },
      { at: 9.4, kind: 'bata', from: 'left', yf: 0.72, vx0: 360, xf: 0 },
      { at: 10.5, xf: 0.5, kind: 'bata', vy0: 265 },
      { at: 11.6, xf: 0.86, kind: 'drum', vy0: 205 },
      { at: 12.7, kind: 'palu', from: 'right', yf: 0.74, vx0: 360, xf: 1 },
      { at: 13.8, xf: 0.36, kind: 'bata', vy0: 270 },
      { at: 14.9, xf: 0.64, kind: 'ember', vy0: 205 },
      { at: 15.9, kind: 'bata', from: 'left', yf: 0.76, vx0: 370, xf: 0 },
      { at: 17.0, xf: 0.45, kind: 'palu', vy0: 245 },
      { at: 18.1, xf: 0.8, kind: 'bata', vy0: 275 },
      { at: 19.2, kind: 'ember', from: 'right', yf: 0.72, vx0: 370, xf: 1 },
      { at: 20.3, xf: 0.28, kind: 'drum', vy0: 210 },
      { at: 21.4, xf: 0.55, kind: 'bata', vy0: 280 },
      { at: 22.5, kind: 'palu', from: 'left', yf: 0.78, vx0: 380, xf: 0 },
      { at: 23.6, xf: 0.62, kind: 'ember', vy0: 210 },
      { at: 24.6, xf: 0.48, kind: 'bata', vy0: 285 },
    ],
  },
];

/* ---------------- state ---------------- */

export type PlayStatus = 'play' | 'win' | 'dead';
export type DeathCause = 'mandor' | 'tukang' | 'sakelar';

export interface ThudEvent {
  x: number;
  y: number;
  strength: number;
}

export interface MandorState {
  W: number;
  H: number;
  level: LevelDef;
  levelIndex: number;
  time: number;
  bodies: Body[];
  line: Vec[];
  /** beam segments built from the smoothed line (physics + rendering) */
  segs: LineSeg[];
  /** snapped line chunks currently falling */
  debris: Debris[];
  inkMax: number;
  inkUsed: number;
  spawnIdx: number;
  status: PlayStatus;
  /** set when status === 'dead' */
  deathCause: DeathCause | null;
  foreman: { x: number; y: number; r: number };
  /** every person who must survive (index 0 = foreman) */
  protectees: Protectee[];
  groundY: number;
  platforms: PlatformState[];
  /** switch box (when the level has one): center + half extents */
  switchBox: { x: number; y: number; hw: number; hh: number } | null;
  /** wind accel px/s² (levels with drift hazards), sign = direction */
  wind: number;
  /** events for the UI layer: sfx + particles (consumed each frame) */
  thuds: ThudEvent[];
  hits: Vec[];
  lands: Vec[];
  breaks: { x: number; y: number }[];
  crumbles: { x: number; y: number }[];
  switchHits: Vec[];
  /**
   * Telegraph: spawn events due within WARN_LEAD seconds (not yet spawned).
   * The UI draws a growing warning + falling whistle for these.
   */
  pending: SpawnEvent[];
}

export function foremanPos(W: number, H: number): { x: number; y: number; r: number } {
  const groundY = H - 64;
  return { x: W / 2, y: groundY - 26, r: 20 };
}

export function protecteePos(
  xf: number, W: number, H: number, role: 'mandor' | 'tukang',
): Protectee {
  const groundY = H - 64;
  return { x: xf * W, y: groundY - 26, r: 20, role };
}

export function createState(levelIndex: number, W: number, H: number): MandorState {
  const level = LEVELS[levelIndex];
  const groundY = H - 64;
  const protectees = protecteeXfs(level).map((xf, i) =>
    protecteePos(xf, W, H, i === 0 ? 'mandor' : 'tukang'));
  const platforms: PlatformState[] = (level.platforms ?? []).map((def) => ({
    def,
    x: def.xf * W,
    y: groundY - def.h,
    w: def.w,
    h: def.h,
    contactT: -1,
    gone: false,
  }));
  const wind = level.features?.some((f) => f.startsWith('Angin')) ? 130 : 0;
  return {
    W, H,
    level,
    levelIndex,
    time: 0,
    bodies: [],
    line: [],
    segs: [],
    debris: [],
    inkMax: level.ink,
    inkUsed: 0,
    spawnIdx: 0,
    status: 'play',
    deathCause: null,
    foreman: foremanPos(W, H),
    protectees,
    groundY,
    platforms,
    switchBox: level.switchDef
      ? { x: level.switchDef.xf * W, y: groundY - 26, hw: 17, hh: 28 }
      : null,
    wind,
    thuds: [],
    hits: [],
    lands: [],
    breaks: [],
    crumbles: [],
    switchHits: [],
    pending: [],
  };
}

/**
 * Smooth a raw pointer polyline into a believable marker stroke:
 *  1. drop near-duplicate points (< 3px apart),
 *  2. two passes of Chaikin corner-cutting (kills touchscreen zigzag),
 *  3. resample to ~8px spacing so the collider sees even segments.
 * Always keeps the first and last points.
 */
export function smoothLine(raw: Vec[]): Vec[] {
  if (raw.length < 3) return raw.map((p) => ({ ...p }));
  // 1. dedupe
  const pts: Vec[] = [raw[0]];
  for (let i = 1; i < raw.length; i += 1) {
    const prev = pts[pts.length - 1];
    if (Math.hypot(raw[i].x - prev.x, raw[i].y - prev.y) >= 3) pts.push(raw[i]);
  }
  if (pts.length < 3) return pts.map((p) => ({ ...p }));

  // 1b. moving average (window 3): bunuh jitter frekuensi-tinggi dulu
  const ma: Vec[] = [{ ...pts[0] }];
  for (let i = 1; i < pts.length - 1; i += 1) {
    ma.push({
      x: (pts[i - 1].x + pts[i].x + pts[i + 1].x) / 3,
      y: (pts[i - 1].y + pts[i].y + pts[i + 1].y) / 3,
    });
  }
  ma.push({ ...pts[pts.length - 1] });

  // 2. Chaikin x2
  let work = ma;
  for (let pass = 0; pass < 2; pass += 1) {
    const out: Vec[] = [work[0]];
    for (let i = 0; i < work.length - 1; i += 1) {
      const a = work[i];
      const b = work[i + 1];
      out.push(
        { x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 },
        { x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 },
      );
    }
    out.push(work[work.length - 1]);
    work = out;
  }

  // 3. resample: titik tiap ~8px sepanjang polyline (seragam, ujung ikut)
  const res: Vec[] = [{ ...work[0] }];
  let walked = 0;
  let target = 8;
  for (let i = 1; i < work.length; i += 1) {
    const a = work[i - 1];
    const b = work[i];
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
    while (walked + segLen >= target && segLen > 1e-9) {
      const t = (target - walked) / segLen;
      res.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      target += 8;
    }
    walked += segLen;
  }
  const last = work[work.length - 1];
  const tail = res[res.length - 1];
  if (Math.hypot(last.x - tail.x, last.y - tail.y) > 1) res.push({ ...last });
  return res;
}

export function lineLength(pts: Vec[]): number {
  let L = 0;
  for (let i = 1; i < pts.length; i += 1) {
    L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  return L;
}

/* ---------------- beam segmentation & support ---------------- */

function endpointSupported(state: MandorState, p: Vec): boolean {
  // rests on the ground
  if (p.y >= state.groundY - 8) return true;
  // rests on a (still standing) platform top
  for (const pl of state.platforms) {
    if (pl.gone) continue;
    if (Math.abs(p.x - pl.x) <= pl.w / 2 + 6 && Math.abs(p.y - pl.y) <= 10) return true;
  }
  // propped within the anchor zone above a protectee (pillar next to him)
  for (const pr of state.protectees) {
    if (Math.abs(p.x - pr.x) <= ANCHOR_ZONE && p.y < pr.y + 4 && p.y > pr.y - 190) return true;
  }
  // bolted to the switch post: the guard structure around the switch
  // stands on the post zone just like a pillar beside a worker.
  const sw = state.switchBox;
  if (sw && Math.abs(p.x - sw.x) <= ANCHOR_ZONE && p.y > sw.y - 200 && p.y < state.groundY) return true;
  return false;
}

/**
 * Chunk the smoothed line into beam segments and recompute support.
 * Called by setLine and whenever support may vanish (platform crumble).
 * Segment endpoints never move except by strain sag (applied at render
 * and collision time via segSag).
 */
export function buildSegments(state: MandorState): void {
  const pts = state.line;
  state.segs = [];
  if (pts.length < 2) return;
  // walk the polyline in SEG_LEN chunks
  let acc = 0;
  let start: Vec = { ...pts[0] };
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1];
    const b = pts[i];
    let segRemain = Math.hypot(b.x - a.x, b.y - a.y);
    let from = 0;
    while (acc + segRemain >= SEG_LEN && segRemain > 1e-9) {
      const need = SEG_LEN - acc;
      const t = from + need / Math.hypot(b.x - a.x, b.y - a.y);
      const cut: Vec = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      state.segs.push({
        a: start, b: cut, load: 0, impact: 0, strain: 0,
        supported: endpointSupported(state, start) || endpointSupported(state, cut),
        broken: false,
      });
      start = cut;
      from = t;
      segRemain = Math.hypot(b.x - cut.x, b.y - cut.y);
      acc = 0;
    }
    acc += segRemain;
  }
  const lastPt = pts[pts.length - 1];
  if (Math.hypot(lastPt.x - start.x, lastPt.y - start.y) > 2) {
    state.segs.push({
      a: start, b: { ...lastPt }, load: 0, impact: 0, strain: 0,
      supported: endpointSupported(state, start) || endpointSupported(state, lastPt),
      broken: false,
    });
  }
  // support propagates PROPAGATE_SUPPORT segments out from a propped one
  propagateSupport(state);
}

/** Current sag (px, downward) of a segment given its strain and span. */
export function segSag(seg: LineSeg): number {
  if (seg.supported) return seg.strain * 2;
  const span = Math.max(1, Math.hypot(seg.b.x - seg.a.x, seg.b.y - seg.a.y) / SEG_LEN);
  return seg.strain * BEAM_FLEX * span * 2.2;
}

/** Effective (sagged) endpoints of a segment for collision/rendering. */
export function segGeom(seg: LineSeg): { a: Vec; b: Vec } {
  const sag = segSag(seg);
  if (sag <= 0.01) return { a: seg.a, b: seg.b };
  // sag bows the middle down; approximate by lowering both ends slightly
  // and letting the midpoint carry the bow (collision uses 2 half-segs).
  return {
    a: { x: seg.a.x, y: seg.a.y + sag * 0.35 },
    b: { x: seg.b.x, y: seg.b.y + sag * 0.35 },
  };
}

export function segMid(seg: LineSeg): Vec {
  const g = segGeom(seg);
  return { x: (g.a.x + g.b.x) / 2, y: (g.a.y + g.b.y) / 2 + segSag(seg) * 0.65 };
}

/**
 * Replace the drawn line. The raw pointer polyline is smoothed first
 * (no jagged zigzag), then points beyond the ink budget are trimmed;
 * only the affordable prefix is kept. Beam segments are rebuilt.
 */
export function setLine(state: MandorState, pts: Vec[]): void {
  const smooth = smoothLine(pts);
  const kept: Vec[] = [];
  let used = 0;
  for (const p of smooth) {
    if (kept.length === 0) {
      kept.push(p);
      continue;
    }
    const prev = kept[kept.length - 1];
    const d = Math.hypot(p.x - prev.x, p.y - prev.y);
    if (used + d > state.inkMax) {
      // partial segment: extend as far as the remaining ink allows
      const remain = state.inkMax - used;
      if (remain > 0.5 && d > 0) {
        const t = remain / d;
        kept.push({ x: prev.x + (p.x - prev.x) * t, y: prev.y + (p.y - prev.y) * t });
        used = state.inkMax;
      }
      break;
    }
    kept.push(p);
    used += d;
  }
  state.line = kept;
  state.inkUsed = used;
  state.debris = [];
  buildSegments(state);
}

/** Erase the line; ink is fully refunded. */
export function clearLine(state: MandorState): void {
  state.line = [];
  state.segs = [];
  state.debris = [];
  state.inkUsed = 0;
}

export function inkLeft(state: MandorState): number {
  return Math.max(0, state.inkMax - state.inkUsed);
}

/* ---------------- physics ---------------- */

const BOUNCE_DAMPING = 0.6;

function distToSegmentInfo(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): { d: number; nx: number; ny: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = 0;
  if (len2 > 0) t = Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / len2));
  const cx = ax + dx * t;
  const cy = ay + dy * t;
  const d = Math.hypot(px - cx, py - cy);
  let nx = 0;
  let ny = -1;
  if (d > 1e-6) {
    nx = (px - cx) / d;
    ny = (py - cy) / d;
  }
  return { d, nx, ny };
}

/**
 * Fill physics defaults for a partially-specified body object. Bodies are
 * normally created by spawnBody with every field set, but tests/tools may
 * push plain literals (the classic Body shape) — normalizing here keeps a
 * missing `origin`/`drift` from poisoning velocities with NaN.
 */
export function normalizeBody(b: Body): Body {
  if (b.origin === undefined) b.origin = 'top';
  if (b.drift === undefined) b.drift = KIND_DRIFT[b.kind] ?? 0;
  if (b.fragile === undefined) b.fragile = b.kind === 'ember';
  if (b.puing === undefined) b.puing = false;
  return b;
}

function spawnBody(state: MandorState, ev: SpawnEvent): void {
  const from = ev.from ?? 'top';
  if (from === 'top') {
    state.bodies.push({
      x: ev.xf * state.W,
      y: -KIND_R[ev.kind] - 4,
      vx: 0,
      vy: ev.vy0 ?? 120,
      r: KIND_R[ev.kind],
      kind: ev.kind,
      rot: 0,
      spin: (ev.xf - 0.5) * 4,
      landed: false,
      landT: 0,
      origin: 'top',
      drift: KIND_DRIFT[ev.kind],
      fragile: ev.kind === 'ember',
      puing: false,
    });
  } else {
    const y = (ev.yf ?? 0.75) * state.H;
    const dir = from === 'left' ? 1 : -1;
    state.bodies.push({
      x: from === 'left' ? -KIND_R[ev.kind] - 4 : state.W + KIND_R[ev.kind] + 4,
      y,
      vx: dir * (ev.vx0 ?? 300),
      vy: 0,
      r: KIND_R[ev.kind],
      kind: ev.kind,
      rot: 0,
      spin: dir * 6,
      landed: false,
      landT: 0,
      origin: from,
      drift: 0,
      fragile: ev.kind === 'ember',
      puing: false,
    });
  }
}

/**
 * Resting contact pass: settle slow bodies onto segments (they press
 * load into the beam), then propagate load and snap overstressed spans.
 * Returns nothing; mutates segs + may spawn debris.
 */
function updateBeam(state: MandorState, dt: number): void {
  // reset loads
  for (const seg of state.segs) seg.load = 0;
  // bodies resting on a segment press their weight into it
  for (const b of state.bodies) {
    if (b.landed) continue;
    const speed = Math.hypot(b.vx, b.vy);
    if (speed > 90) continue; // still flying: no sustained load
    for (const seg of state.segs) {
      if (seg.broken) continue;
      const g = segGeom(seg);
      const mid = segMid(seg);
      const { d } = distToSegmentInfo(b.x, b.y, g.a.x, g.a.y, g.b.x, g.b.y);
      const nearMid = Math.hypot(b.x - mid.x, b.y - mid.y);
      if (d < b.r + 4 && nearMid < SEG_LEN * 0.95) {
        seg.load += KIND_WEIGHT[b.kind];
        break;
      }
    }
  }
  // propagate: unsupported segments push part of their load to neighbours,
  // and their own effective load grows with the unsupported run length.
  const n = state.segs.length;
  const eff = new Array<number>(n).fill(0);
  let run = 0;
  for (let i = 0; i < n; i += 1) {
    const seg = state.segs[i];
    if (seg.supported) run = 0;
    else run += 1;
    const spanFactor = 1 + 0.32 * Math.max(0, run - 1);
    eff[i] = seg.load * spanFactor;
  }
  // neighbour transfer (two relaxation passes, both directions)
  for (let pass = 0; pass < 2; pass += 1) {
    for (let i = 0; i < n; i += 1) {
      if (state.segs[i].supported) continue;
      const share = eff[i] * SEG_LOAD_TRANSFER * 0.5;
      if (i > 0 && !state.segs[i - 1].supported) eff[i - 1] += share;
      if (i < n - 1 && !state.segs[i + 1].supported) eff[i + 1] += share;
      if (i > 0 && state.segs[i - 1].supported) eff[i] -= share * 0.4;
      if (i < n - 1 && state.segs[i + 1].supported) eff[i] -= share * 0.4;
    }
  }
  // strain + snap (resting load + accumulated impact stress)
  for (let i = 0; i < n; i += 1) {
    const seg = state.segs[i];
    if (seg.broken) continue;
    seg.impact = Math.max(0, seg.impact - dt * 0.35);
    const total = eff[i] + seg.impact;
    const target = seg.supported
      ? Math.min(0.3, total / BREAK_LOAD)
      : total / BREAK_LOAD;
    seg.strain += (target - seg.strain) * Math.min(1, dt * 3.2);
    if (!seg.supported && total > BREAK_LOAD && seg.strain > 0.82) {
      seg.broken = true;
      const mid = segMid(seg);
      state.breaks.push({ x: mid.x, y: mid.y });
      // two rigid chunks fall away
      const g = segGeom(seg);
      state.debris.push(
        { a: g.a, b: { x: mid.x, y: mid.y }, vx: -30, vy: 40, rot: 0, cx: (g.a.x + mid.x) / 2, cy: (g.a.y + mid.y) / 2, life: 1.5, kind: 'line' },
        { a: { x: mid.x, y: mid.y }, b: g.b, vx: 30, vy: 40, rot: 0, cx: (mid.x + g.b.x) / 2, cy: (mid.y + g.b.y) / 2, life: 1.5, kind: 'line' },
      );
      // the visible line loses the snapped span: rebuild kept parts
      rebuildLineAfterBreak(state);
      return; // one snap per step is dramatic enough
    }
  }
}

/**
 * After a snap, the remaining intact segments become the new line.
 * Ink is NOT refunded for the snapped span (it was spent), and pieces far
 * from the foreman simply vanish — only geometry near a protectee could
 * still matter, so keep the run that contains a supported segment.
 */
function rebuildLineAfterBreak(state: MandorState): void {
  const kept: Vec[] = [];
  for (const seg of state.segs) {
    if (seg.broken) {
      if (kept.length > 0) break; // keep the longest prefix run only
      continue;
    }
    const g = segGeom(seg);
    if (kept.length === 0) kept.push({ ...g.a });
    kept.push({ ...g.b });
  }
  const spentBefore = state.inkUsed;
  state.line = kept;
  buildSegments(state);
  // preserve the spend: snapped ink is gone for good
  state.inkUsed = Math.max(lineLength(kept), spentBefore - SEG_LEN);
}

/** Circle vs static platform rects (bodies + line support endpoints). */
function collideBodyWithPlatforms(state: MandorState, b: Body): void {
  for (const pl of state.platforms) {
    if (pl.gone) continue;
    const left = pl.x - pl.w / 2;
    const right = pl.x + pl.w / 2;
    // only the top face matters (platforms are thin scaffold decks on legs)
    if (b.x + b.r > left && b.x - b.r < right) {
      const topDist = b.y + b.r - pl.y;
      if (topDist > 0 && topDist < b.r + 10 && b.vy > 0) {
        b.y = pl.y - b.r;
        b.vy = -b.vy * BOUNCE_DAMPING * 0.7;
        if (Math.abs(b.vy) < 60) {
          b.vy = 0;
          b.landed = true;
          b.landT = 0;
        }
        touchPlatform(state, pl, 0.016);
      }
    }
  }
}

function touchPlatform(state: MandorState, pl: PlatformState, dt: number): void {
  if (!pl.def.crumble) return;
  if (pl.contactT < 0) pl.contactT = 0;
  pl.contactT += dt;
  if (pl.contactT >= (pl.def.crumbleAfter ?? 2)) {
    pl.gone = true;
    state.crumbles.push({ x: pl.x, y: pl.y + pl.h / 2 });
    // support vanished: bodies that "landed" on it fall again
    for (const b of state.bodies) {
      if (b.landed && Math.abs(b.y + b.r - pl.y) < 4 && Math.abs(b.x - pl.x) <= pl.w / 2 + b.r) {
        b.landed = false;
        b.vy = 30;
      }
    }
    // line endpoints that rested on it lose DIRECT support; propagation
    // from neighbouring supports is recomputed the same way as build time
    for (const seg of state.segs) {
      seg.supported = endpointSupported(state, seg.a) || endpointSupported(state, seg.b);
    }
    propagateSupport(state);
  }
}

/** Support spreads PROPAGATE_SUPPORT segments out from a propped one. */
export function propagateSupport(state: MandorState): void {
  for (let d = 0; d < PROPAGATE_SUPPORT; d += 1) {
    const src = state.segs.map((sg) => sg.supported);
    for (let i = 0; i < state.segs.length; i += 1) {
      if ((i > 0 && src[i - 1]) || (i < state.segs.length - 1 && src[i + 1])) {
        state.segs[i].supported = true;
      }
    }
  }
}

/** Line resting on a crumbling platform counts as contact too. */
function platformLineContact(state: MandorState, dt: number): void {
  for (const pl of state.platforms) {
    if (pl.gone || !pl.def.crumble) continue;
    for (const seg of state.segs) {
      const g = segGeom(seg);
      const touches =
        (Math.abs(g.a.x - pl.x) <= pl.w / 2 + 6 && Math.abs(g.a.y - pl.y) <= 10) ||
        (Math.abs(g.b.x - pl.x) <= pl.w / 2 + 6 && Math.abs(g.b.y - pl.y) <= 10);
      if (touches) {
        touchPlatform(state, pl, dt);
        break;
      }
    }
  }
}

function collideBodyWithLine(state: MandorState, b: Body): void {
  for (const seg of state.segs) {
    if (seg.broken) continue;
    const g = segGeom(seg);
    const mid = segMid(seg);
    // collide against two half-segments (bowed middle)
    const halves: [Vec, Vec][] = [[g.a, mid], [mid, g.b]];
    for (const [ha, hb] of halves) {
      const { d, nx, ny } = distToSegmentInfo(b.x, b.y, ha.x, ha.y, hb.x, hb.y);
      if (d < b.r) {
        const vn = b.vx * nx + b.vy * ny;
        if (vn < 0) {
          b.vx = (b.vx - 2 * vn * nx) * BOUNCE_DAMPING;
          b.vy = (b.vy - 2 * vn * ny) * BOUNCE_DAMPING;
          state.thuds.push({
            x: b.x - nx * b.r,
            y: b.y - ny * b.r,
            strength: Math.min(1, Math.abs(vn) / 600),
          });
          // a hard hit stresses the beam (heavier kinds stress more);
          // walls and strongly-sloped ramps shed most of the blow.
          const slope = Math.abs(hb.y - ha.y) / Math.max(1, Math.hypot(hb.x - ha.x, hb.y - ha.y));
          const shed = slope > 0.55 ? 0.25 : 1;
          seg.impact = Math.min(
            2.6,
            seg.impact + (Math.abs(vn) / 780) * KIND_WEIGHT[b.kind] * shed,
          );
        }
        const push = b.r - d + 0.5;
        b.x += nx * push;
        b.y += ny * push;
      }
    }
  }
}

function physicsSubstep(state: MandorState, dt: number): void {
  const g = state.level.gravity;
  for (const b of state.bodies) {
    normalizeBody(b);
    if (b.landed) {
      b.landT += dt;
      // corpses must not be re-processed: the mid-air revive below would
      // otherwise resurrect the body and (via the rescue logic) let it
      // settle repeatedly until the removal filter eats it in one step.
      if (b.landT >= 2.6) continue;
      // settled debris that still touches the ground band is inert;
      // bodies parked in the air by collision resolution resume falling.
      if (b.y + b.r < state.groundY - 2) {
        b.landed = false;
        b.vy = Math.max(b.vy, 20);
      } else {
        continue;
      }
    }
    b.vy += g * dt;
    if (b.drift !== 0) b.vx += state.wind * b.drift * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.rot += b.spin * dt;

    // side walls: soft bounce (side-flyers keep most of their energy:
    // they are thrown, so they ricochet around the site)
    if (b.x < b.r) {
      b.x = b.r;
      b.vx = Math.abs(b.vx) * (b.origin === 'top' ? BOUNCE_DAMPING : 0.82);
    } else if (b.x > state.W - b.r) {
      b.x = state.W - b.r;
      b.vx = -Math.abs(b.vx) * (b.origin === 'top' ? BOUNCE_DAMPING : 0.82);
    }
    if (b.y < b.r && b.origin !== 'top') {
      b.y = b.r;
      b.vy = Math.abs(b.vy) * 0.7;
    }

    collideBodyWithLine(state, b);
    collideBodyWithPlatforms(state, b);

    // anything that ends up UNDER the ground line dies there (no bodies
    // resting inside the slab where they could later roll into a worker)
    if (b.y + b.r > state.groundY + 26) {
      b.y = state.groundY + 26 - b.r;
      b.landed = true;
      b.landT = 2.59;
    }

    // protectee hit?
    for (const p of state.protectees) {
      const df = Math.hypot(b.x - p.x, b.y - p.y);
      if (df < b.r + p.r - 2) {
        state.status = 'dead';
        state.deathCause = p.role === 'mandor' ? 'mandor' : 'tukang';
        state.hits.push({ x: p.x, y: p.y - p.r });
        return;
      }
    }

    // switch hit? (only while the body still carries real speed — a body
    // resting gently against the post is debris, not an impact)
    const sw = state.switchBox;
    if (sw && !b.landed && Math.hypot(b.vx, b.vy) > 130) {
      if (Math.abs(b.x - sw.x) < sw.hw + b.r * 0.7 && Math.abs(b.y - sw.y) < sw.hh + b.r * 0.7) {
        state.status = 'dead';
        state.deathCause = 'sakelar';
        state.switchHits.push({ x: sw.x, y: sw.y });
        return;
      }
    }

    // coming in nearly straight-down along the ground line: the body is
    // ploughing INTO the slab band and must settle on top of it in this
    // same substep (before the protectee check), not slice through the
    // band at head height.
    if (b.y + b.r >= state.groundY - 14 && b.y < state.groundY && b.vy > 300 && Math.abs(b.vx) < 500) {
      b.y = state.groundY - b.r;
      b.vy = 0;
      if (b.fragile) {
        b.landed = true;
        b.landT = 2.59;
      } else if (Math.abs(b.vx) <= 130 || b.origin === 'top') {
        b.landed = true;
        b.landT = 0;
      }
      if (b.landed) state.lands.push({ x: b.x, y: state.groundY });
    }

    // ground: land (harmless) — fragile ember shatters instead of resting.
    // A body arriving with strong HORIZONTAL speed (thrown from the side)
    // skids: it keeps sliding along the ground and stays lethal until it
    // slows down — that is what makes side throws dangerous even for a
    // worker hiding under a roof.
    if (!b.landed && b.y + b.r >= state.groundY) {
      b.y = state.groundY - b.r;
      if (b.fragile && b.vy > 260) {
        b.landed = true;
        b.landT = 1.19; // disappears almost immediately (shattered)
      } else if (Math.abs(b.vx) > 130 && b.origin !== 'top') {
        // skid (thrown objects only): friction decays the speed while the
        // body keeps sliding this step — fast enough to stay dangerous to
        // a worker in its path, slow enough to stop within ~40px.
        b.vx *= Math.pow(0.45, dt * 8); // friction skid
        b.x += b.vx * dt;
        b.vy = 0;
        b.rot += b.vx * dt * 0.05;
        state.lands.push({ x: b.x, y: state.groundY });
        // skidding is still a live hazard: it can roll into a worker
        for (const p of state.protectees) {
          if (Math.hypot(b.x - p.x, b.y - p.y) < b.r + p.r - 2) {
            state.status = 'dead';
            state.deathCause = p.role === 'mandor' ? 'mandor' : 'tukang';
            state.hits.push({ x: p.x, y: p.y - p.r });
            return;
          }
        }
      } else {
        b.landed = true;
        b.landT = 0;
        state.lands.push({ x: b.x, y: state.groundY });
      }
    }
  }
  // drop long-landed debris
  state.bodies = state.bodies.filter((b) => !b.landed || b.landT < 2.6);
}

/** Advance the simulation. Pure: mutates the passed state only. */
export function step(state: MandorState, dt: number): void {
  if (state.status !== 'play') return;
  state.thuds.length = 0;
  state.hits.length = 0;
  state.lands.length = 0;
  state.breaks.length = 0;
  state.crumbles.length = 0;
  state.switchHits.length = 0;

  state.time += dt;

  // spawn due events
  const spawns = state.level.spawns;
  while (state.spawnIdx < spawns.length && spawns[state.spawnIdx].at <= state.time) {
    spawnBody(state, spawns[state.spawnIdx]);
    state.spawnIdx += 1;
  }

  // telegraph: events due within WARN_LEAD (not yet spawned)
  state.pending = [];
  for (let i = state.spawnIdx; i < spawns.length; i += 1) {
    const ev = spawns[i];
    if (ev.at - state.time > WARN_LEAD) break;
    if (ev.at > state.time) state.pending.push(ev);
  }

  // substep so fast bodies can't tunnel through the line
  let maxV = 0;
  for (const b of state.bodies) {
    maxV = Math.max(maxV, Math.hypot(b.vx, b.vy));
  }
  const maxStep = Math.max(1, Math.ceil((maxV * dt) / 8));
  const sub = Math.min(24, maxStep);
  const sdt = dt / sub;
  for (let i = 0; i < sub; i += 1) {
    physicsSubstep(state, sdt);
    if (state.status !== 'play') break;
  }

  if (state.status === 'play') {
    updateBeam(state, dt);
    platformLineContact(state, dt);
    // debris fall + fade
    for (const d of state.debris) {
      d.vy += state.level.gravity * 0.8 * dt;
      d.cx += d.vx * dt;
      d.cy += d.vy * dt;
      d.rot += dt * 2.4;
      d.life -= dt;
      const dx = d.b.x - d.a.x;
      const dy = d.b.y - d.a.y;
      const ox = d.cx - (d.a.x + d.b.x) / 2;
      const oy = d.cy - (d.a.y + d.b.y) / 2;
      d.a = { x: d.a.x + ox, y: d.a.y + oy };
      d.b = { x: d.b.x + ox, y: d.b.y + oy };
      void dx; void dy;
    }
    state.debris = state.debris.filter((d) => d.life > 0 && d.cy < state.H + 80);
  }

  if (state.status === 'play' && state.time >= state.level.duration) {
    state.status = 'win';
  }
}

/** Stars earned: more leftover ink = better (1..3). */
export function starsFor(state: MandorState): number {
  const frac = inkLeft(state) / state.inkMax;
  if (frac >= 0.5) return 3;
  if (frac >= 0.22) return 2;
  return 1;
}

/** Reset a state for replay of the same level/dimensions. */
export function resetState(state: MandorState): void {
  const fresh = createState(state.levelIndex, state.W, state.H);
  Object.assign(state, fresh);
}

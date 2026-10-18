/**
 * EZRAB Game Space v2 — procedural sound effects (src/game-space/fx/audio.ts)
 *
 * No audio assets: every sound is synthesized with the Web Audio API
 * (oscillators + filtered noise buffers). The AudioContext is created lazily
 * on the first user gesture. Mute state persists in localStorage.
 *
 * All methods are safe to call before init / when WebAudio is unavailable.
 */

const MUTE_KEY = 'gs-sfx-muted';

type OscType = OscillatorType;

class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  muted = false;

  constructor() {
    try {
      this.muted = typeof localStorage !== 'undefined' && localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      this.muted = false;
    }
  }

  /** Must be called from a user gesture at least once. Safe to call often. */
  ensure(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => undefined);
      }
      return;
    }
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      // 1s reusable noise buffer
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    } catch {
      this.ctx = null;
    }
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    try {
      localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0');
    } catch {
      /* storage unavailable */
    }
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.5, this.ctx.currentTime, 0.02);
    }
    return this.muted;
  }

  private tone(opts: {
    freq: number;
    freqEnd?: number;
    type?: OscType;
    dur?: number;
    vol?: number;
    delay?: number;
  }): void {
    if (!this.ctx || !this.master || this.muted) return;
    try {
      const t0 = this.ctx.currentTime + (opts.delay ?? 0);
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = opts.type ?? 'sine';
      osc.frequency.setValueAtTime(opts.freq, t0);
      if (opts.freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.freqEnd), t0 + (opts.dur ?? 0.15));
      const vol = opts.vol ?? 0.5;
      const dur = opts.dur ?? 0.15;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(vol, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      osc.connect(g);
      g.connect(this.master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    } catch {
      /* ignore */
    }
  }

  private noise(opts: {
    dur?: number;
    vol?: number;
    filterFreq?: number;
    filterEnd?: number;
    type?: BiquadFilterType;
    delay?: number;
  }): void {
    if (!this.ctx || !this.master || !this.noiseBuf || this.muted) return;
    try {
      const t0 = this.ctx.currentTime + (opts.delay ?? 0);
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const filt = this.ctx.createBiquadFilter();
      filt.type = opts.type ?? 'lowpass';
      filt.frequency.setValueAtTime(opts.filterFreq ?? 800, t0);
      if (opts.filterEnd) filt.frequency.exponentialRampToValueAtTime(Math.max(20, opts.filterEnd), t0 + (opts.dur ?? 0.3));
      const g = this.ctx.createGain();
      const vol = opts.vol ?? 0.5;
      const dur = opts.dur ?? 0.3;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(vol, t0 + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      src.connect(filt);
      filt.connect(g);
      g.connect(this.master);
      src.start(t0);
      src.stop(t0 + dur + 0.05);
    } catch {
      /* ignore */
    }
  }

  /* ---------------- game sounds ---------------- */

  /** UI tick. */
  click(): void {
    this.tone({ freq: 660, freqEnd: 520, type: 'triangle', dur: 0.07, vol: 0.25 });
  }

  /** Satisfying pop — perfect placements, bubble-ish. */
  pop(pitch = 1): void {
    this.tone({ freq: 520 * pitch, freqEnd: 880 * pitch, type: 'sine', dur: 0.12, vol: 0.45 });
    this.tone({ freq: 1040 * pitch, type: 'sine', dur: 0.09, vol: 0.18, delay: 0.03 });
  }

  /** Heavy landing thud. */
  thud(strength = 1): void {
    this.noise({ dur: 0.16, vol: 0.5 * strength, filterFreq: 220, filterEnd: 60 });
    this.tone({ freq: 90, freqEnd: 38, type: 'sine', dur: 0.18, vol: 0.55 * strength });
  }

  /** Building crumble — longer filtered noise + rumble. */
  crumble(size = 1): void {
    this.noise({ dur: 0.45 * size, vol: 0.5, filterFreq: 1400, filterEnd: 120 });
    this.noise({ dur: 0.3 * size, vol: 0.35, filterFreq: 400, filterEnd: 70, delay: 0.06 });
    this.tone({ freq: 70, freqEnd: 32, type: 'sine', dur: 0.4 * size, vol: 0.4 });
  }

  /** Bright chime — combo / win. */
  chime(steps = 2, base = 660): void {
    const scale = [0, 4, 7, 12];
    for (let i = 0; i < steps; i += 1) {
      const f = base * 2 ** (scale[i % scale.length] / 12);
      this.tone({ freq: f, type: 'sine', dur: 0.35, vol: 0.3, delay: i * 0.09 });
      this.tone({ freq: f * 2, type: 'sine', dur: 0.22, vol: 0.1, delay: i * 0.09 });
    }
  }

  /** Rising whoosh — block drop / tower rise. */
  whoosh(): void {
    this.noise({ dur: 0.25, vol: 0.22, filterFreq: 500, filterEnd: 3200, type: 'bandpass' });
  }

  /** Sad descending tone — game over. */
  fail(): void {
    this.tone({ freq: 320, freqEnd: 140, type: 'sawtooth', dur: 0.5, vol: 0.22 });
    this.tone({ freq: 210, freqEnd: 95, type: 'sawtooth', dur: 0.55, vol: 0.16, delay: 0.12 });
  }
}

/** Shared singleton — one AudioContext for all games. */
export const sfx = new Sfx();

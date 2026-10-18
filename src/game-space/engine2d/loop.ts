/**
 * EZRAB Game Space 2D — fixed-timestep game loop (src/game-space/engine2d/loop.ts)
 *
 * update() runs at a fixed step (default 60Hz, spiral-of-death guarded);
 * render() runs every animation frame. update() is skipped while paused
 * (render still runs so the last frame stays visible under overlays).
 */

export class Loop {
  private raf = 0;
  private last = 0;
  private acc = 0;
  private paused = false;
  private running = false;

  constructor(
    private readonly update: (dt: number) => void,
    private readonly render: () => void,
    private readonly fixed: number = 1 / 60,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.acc = 0;
    const tick = (t: number): void => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(tick);
      let dt = (t - this.last) / 1000;
      this.last = t;
      if (dt > 0.25) dt = 0.25; // tab-switch clamp
      if (!this.paused) {
        this.acc += dt;
        let n = 0;
        while (this.acc >= this.fixed && n < 5) {
          this.update(this.fixed);
          this.acc -= this.fixed;
          n += 1;
        }
        if (n === 5) this.acc = 0; // drop backlog (spiral guard)
      }
      this.render();
    };
    this.raf = requestAnimationFrame(tick);
  }

  setPaused(p: boolean): void {
    this.paused = p;
    if (!p) {
      this.last = performance.now();
      this.acc = 0;
    }
  }

  get isPaused(): boolean {
    return this.paused;
  }

  dispose(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }
}

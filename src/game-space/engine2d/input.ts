/**
 * EZRAB Game Space 2D — unified pointer + keyboard input (src/game-space/engine2d/input.ts)
 *
 * Pointer Events cover mouse + touch. Coordinates are CSS pixels relative
 * to the canvas. touch-action:none is set so swipes don't scroll the page.
 */

export interface PPoint {
  x: number;
  y: number;
}

export type PointerHandler = (p: PPoint, e: PointerEvent) => void;

const GAME_KEYS = new Set([
  'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyP', 'Escape', 'Enter',
]);

export class Input {
  onDown: PointerHandler | null = null;
  onMove: PointerHandler | null = null;
  onUp: PointerHandler | null = null;

  private held = new Set<string>();
  private pressed = new Set<string>();
  private disposers: Array<() => void> = [];

  constructor(private readonly canvas: HTMLCanvasElement) {
    canvas.style.touchAction = 'none';
    canvas.style.userSelect = 'none';
    (canvas.style as unknown as Record<string, string>).webkitUserSelect = 'none';

    const toLocal = (e: PointerEvent): PPoint => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const down = (e: PointerEvent): void => {
      e.preventDefault();
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      this.onDown?.(toLocal(e), e);
    };
    const move = (e: PointerEvent): void => {
      this.onMove?.(toLocal(e), e);
    };
    const up = (e: PointerEvent): void => {
      this.onUp?.(toLocal(e), e);
    };
    const kd = (e: KeyboardEvent): void => {
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.held.add(e.code);
    };
    const ku = (e: KeyboardEvent): void => {
      this.held.delete(e.code);
    };
    const blur = (): void => {
      this.held.clear();
      this.pressed.clear();
    };

    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    window.addEventListener('blur', blur);
    this.disposers = [
      () => canvas.removeEventListener('pointerdown', down),
      () => canvas.removeEventListener('pointermove', move),
      () => canvas.removeEventListener('pointerup', up),
      () => canvas.removeEventListener('pointercancel', up),
      () => window.removeEventListener('keydown', kd),
      () => window.removeEventListener('keyup', ku),
      () => window.removeEventListener('blur', blur),
    ];
  }

  /** Is the key currently held? (e.code, e.g. 'ArrowLeft') */
  down(code: string): boolean {
    return this.held.has(code);
  }

  /**
   * Edge-trigger: true once per physical press. Call from update();
   * consumed on read so each press fires exactly once.
   */
  wasPressed(code: string): boolean {
    if (this.pressed.has(code)) {
      this.pressed.delete(code);
      return true;
    }
    return false;
  }

  /** Clear stale edge presses (call at end of update if you like). */
  clearPressed(): void {
    this.pressed.clear();
  }

  dispose(): void {
    this.disposers.forEach((d) => d());
    this.disposers = [];
  }
}

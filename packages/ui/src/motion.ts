/** Motion primitives. CSS animates only transform / opacity / colour; these drive values frame by frame. */

import type { ReactiveController, ReactiveControllerHost } from 'lit';

let preference: 'system' | 'reduced' = 'system';

/**
 * The controls drawn in a shadow root of their own (a ruler, a dial), where a card's `reduced-motion` rules never
 * reach: each carries the mark itself, as the card does, from the moment it is attached.
 */
const marked = new Set<HTMLElement>();
const mark = (host: HTMLElement): void => {
  host.toggleAttribute('reduced-motion', preference === 'reduced');
};

/** A person's own choice (fluvy's settings) on top of the system's: `reduced` holds everywhere, `system` asks the OS. */
export function setMotionPreference(value: 'system' | 'reduced'): void {
  preference = value;
  marked.forEach(mark);
}

/** Marks its host `reduced-motion` while the person chose reduced motion, from its connection on. */
export class MotionMark implements ReactiveController {
  constructor(private readonly host: ReactiveControllerHost & HTMLElement) {
    host.addController(this);
  }

  hostConnected(): void {
    marked.add(this.host);
    mark(this.host);
  }

  hostDisconnected(): void {
    marked.delete(this.host);
  }
}

export const motionPreference = (): 'system' | 'reduced' => preference;

export const reducedMotion = (): boolean =>
  preference === 'reduced' ||
  (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);

export interface SpringOptions {
  readonly stiffness?: number;
  /** Damping ratio: 1 is critically damped, below 1 overshoots. */
  readonly damping?: number;
  readonly precision?: number;
}

export interface SpringHandle {
  set(target: number): void;
  jump(value: number): void;
  stop(): void;
  readonly value: number;
}

/** A cancellable spring that follows a moving target (a knob catching up with a state, a lift easing in). */
export function spring(
  initial: number,
  onUpdate: (value: number) => void,
  options: SpringOptions = {},
): SpringHandle {
  const stiffness = options.stiffness ?? 380;
  const damping = 2 * (options.damping ?? 0.82) * Math.sqrt(stiffness);
  const precision = options.precision ?? 0.0005;
  let value = initial;
  let velocity = 0;
  let target = initial;
  let frame = 0;
  let last = 0;
  const step = (now: number): void => {
    const dt = Math.min(0.032, (now - last) / 1000 || 0.016);
    last = now;
    velocity += (stiffness * (target - value) - damping * velocity) * dt;
    value += velocity * dt;
    if (Math.abs(target - value) < precision && Math.abs(velocity) < precision) {
      value = target;
      velocity = 0;
      frame = 0;
      onUpdate(value);
      return;
    }
    onUpdate(value);
    frame = requestAnimationFrame(step);
  };
  return {
    set(next) {
      target = next;
      if (reducedMotion()) {
        value = next;
        velocity = 0;
        onUpdate(value);
        return;
      }
      if (!frame) {
        last = performance.now();
        frame = requestAnimationFrame(step);
      }
    },
    jump(next) {
      target = value = next;
      velocity = 0;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      onUpdate(value);
    },
    stop() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    },
    get value() {
      return value;
    },
  };
}

/** Eased one-off transition (a number rolling to its new value). Returns a cancel function. */
export function tween(
  from: number,
  to: number,
  ms: number,
  onUpdate: (value: number) => void,
): () => void {
  if (reducedMotion() || ms <= 0 || from === to) {
    onUpdate(to);
    return () => undefined;
  }
  const start = performance.now();
  let frame = 0;
  const tick = (now: number): void => {
    const t = Math.min(1, (now - start) / ms);
    onUpdate(from + (to - from) * (1 - Math.pow(1 - t, 3)));
    if (t < 1) frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}

/**
 * Optimistic value: after the user commits, the control keeps showing what they chose until Home
 * Assistant confirms it (or a few seconds pass) — the knob never snaps back to a stale state.
 */
export class Pending {
  private value: number | null = null;
  private timer = 0;

  constructor(
    private readonly onExpire: () => void,
    private readonly ms = 4000,
  ) {}

  hold(value: number): void {
    this.value = value;
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.value = null;
      this.onExpire();
    }, this.ms);
  }

  /** Given the confirmed value, returns what to show. Clears itself once they agree. */
  resolve(confirmed: number, tolerance: number): number {
    if (this.value === null) return confirmed;
    if (Math.abs(confirmed - this.value) <= tolerance) {
      this.clear();
      return confirmed;
    }
    return this.value;
  }

  clear(): void {
    this.value = null;
    clearTimeout(this.timer);
  }

  get active(): boolean {
    return this.value !== null;
  }

  /** The value being held, or null. */
  get held(): number | null {
    return this.value;
  }
}

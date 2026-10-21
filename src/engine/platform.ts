import type { PlatformDef, PlatformPath } from './types';

const pathOut = { dx: 0, dy: 0 };

/**
 * Offset of a keyframed route at `tick` (smoothstep between keys, wrapping from the last key to the first). Pure. Writes into
 * and returns a shared object: copy the numbers before the next call.
 */
export function pathOffset(path: PlatformPath, tick: number): { dx: number; dy: number } {
  const k = path.keys;
  const t = ((tick % path.period) + path.period) % path.period;
  let i = k.length - 1;
  for (let j = 0; j < k.length; j++) if (k[j].t <= t) i = j;
  const a = k[i];
  const b = k[(i + 1) % k.length];
  const t0 = a.t;
  let t1 = b.t;
  let tt = t;
  if (t1 <= t0) t1 += path.period;
  if (tt < t0) tt += path.period;
  const u = t1 > t0 ? Math.min(1, Math.max(0, (tt - t0) / (t1 - t0))) : 0;
  const e = u * u * (3 - 2 * u);
  pathOut.dx = a.dx + (b.dx - a.dx) * e;
  pathOut.dy = a.dy + (b.dy - a.dy) * e;
  return pathOut;
}

/** Runtime platform: static or moving. Positions are top-left, previous-tick values kept for carry + interpolation. */
export class Platform {
  readonly id: number;
  readonly kind: 'solid' | 'pass';
  readonly w: number;
  readonly h: number;
  readonly ledges: boolean;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  /** Displacement during the most recent tick. */
  dx = 0;
  dy = 0;
  private readonly baseX: number;
  private readonly baseY: number;

  constructor(
    id: number,
    readonly def: PlatformDef,
    /** Moved by game logic (crystal pillars) rather than a `move` def. */
    readonly dynamic = false,
  ) {
    this.id = id;
    this.kind = def.kind;
    this.w = def.w;
    this.h = def.h;
    this.ledges = !!def.ledges && def.kind === 'solid';
    this.baseX = def.x;
    this.baseY = def.y;
    this.x = this.prevX = def.x;
    this.y = this.prevY = def.y;
    if (def.move || def.path) this.place(0);
  }

  get moving(): boolean {
    return !!this.def.move || !!this.def.path || this.dynamic;
  }

  get top(): number {
    return this.y;
  }
  get bottom(): number {
    return this.y + this.h;
  }
  get right(): number {
    return this.x + this.w;
  }

  /** Advance to the given sim tick. Deterministic: position is a pure function of tick. */
  update(tick: number): void {
    if (this.dynamic) return; // driven by stepPillars
    this.prevX = this.x;
    this.prevY = this.y;
    if (this.def.move || this.def.path) this.place(tick);
    this.dx = this.x - this.prevX;
    this.dy = this.y - this.prevY;
  }

  private place(tick: number): void {
    if (this.def.path) {
      const o = pathOffset(this.def.path, tick);
      this.x = this.baseX + o.dx;
      this.y = this.baseY + o.dy;
      return;
    }
    const m = this.def.move!;
    const t = tick / m.period + (m.phase ?? 0);
    const off = Math.sin(t * Math.PI * 2) * m.amplitude;
    if (m.axis === 'x') {
      this.x = this.baseX + off;
      this.y = this.baseY;
    } else {
      this.x = this.baseX;
      this.y = this.baseY + off;
    }
  }
}

/** A grabbable top corner of a solid platform. Only one fighter can hang on it at a time. */
export class Ledge {
  /** Fighter id hanging here, or -1. */
  occupant = -1;
  constructor(
    readonly platform: Platform,
    /** -1 = left corner (fighter hangs off the left side), +1 = right corner. */
    readonly side: -1 | 1,
  ) {}
  get x(): number {
    return this.side === -1 ? this.platform.x : this.platform.right;
  }
  get y(): number {
    return this.platform.top;
  }
}

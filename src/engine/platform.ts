import type { PlatformDef } from './types';

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
    if (def.move) this.place(0);
  }

  get moving(): boolean {
    return !!this.def.move || this.dynamic;
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
    if (this.def.move) this.place(tick);
    this.dx = this.x - this.prevX;
    this.dy = this.y - this.prevY;
  }

  private place(tick: number): void {
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

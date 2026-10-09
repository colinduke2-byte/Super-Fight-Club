import type { Platform } from './platform';

/** Max displacement per collision sub-step; keeps fast launches from tunnelling. */
const MAX_SUBSTEP = 5;
const EPS = 0.001;

/** What the collision resolver needs from a moving body (a Fighter structurally satisfies this). */
export interface Body {
  x: number; // bottom-centre
  y: number;
  vx: number;
  vy: number;
  readonly hw: number; // body half-width
  readonly h: number; // body height
  readonly fhw: number; // foot half-width (support / landing)
  /** Bottom y at the start of the tick (before any movement); used for one-way platform landing. */
  startBottom: number;
  grounded: boolean;
  groundPlat: Platform | null;
  // ---- outputs, rewritten by moveBody ----
  /** -1 = blocked by a wall on the left, +1 = wall on the right, 0 = none. */
  wall: number;
  hitCeil: boolean;
  landed: boolean;
  /** Velocity at the moment of the first impact this tick (before it was zeroed). */
  impactVx: number;
  impactVy: number;
}

/**
 * Integrates body velocity against the platform list: solid blocks stop movement from every side,
 * pass-through platforms only catch a body falling onto them from above. Axis-separated with
 * sub-stepping. Pure function of its inputs, so it is deterministic.
 */
export function moveBody(b: Body, platforms: readonly Platform[]): void {
  b.wall = 0;
  b.hitCeil = false;
  b.landed = false;
  b.impactVx = b.vx;
  b.impactVy = b.vy;

  if (b.grounded) {
    const n = Math.max(1, Math.ceil(Math.abs(b.vx) / MAX_SUBSTEP));
    const sx = b.vx / n;
    for (let i = 0; i < n; i++) {
      b.x += sx;
      pushOutX(b, platforms);
    }
    if (b.wall !== 0 && Math.sign(b.vx) === b.wall) b.vx = 0;
    b.vy = 0;
    updateSupport(b, platforms);
    return;
  }

  const n = Math.max(1, Math.ceil(Math.max(Math.abs(b.vx), Math.abs(b.vy)) / MAX_SUBSTEP));
  const sx = b.vx / n;
  let sy = b.vy / n;
  let landedAt = false;
  for (let i = 0; i < n; i++) {
    b.x += sx;
    pushOutX(b, platforms);
    if (!landedAt) {
      b.y += sy;
      if (resolveY(b, platforms, sy)) {
        landedAt = true;
        sy = 0;
      }
      pushOutX(b, platforms);
    }
  }
  if (b.wall !== 0 && Math.sign(b.vx) === b.wall) b.vx = 0;
  if (b.hitCeil && b.vy < 0) b.vy = 0;
  if (landedAt) {
    b.vy = 0;
    b.grounded = true;
    b.landed = true;
  }
}

function overlapsX(b: Body, p: Platform): boolean {
  return b.x + b.hw > p.x + EPS && b.x - b.hw < p.right - EPS;
}

function footOverlaps(b: Body, p: Platform): boolean {
  return b.x + b.fhw > p.x && b.x - b.fhw < p.right;
}

function pushOutX(b: Body, platforms: readonly Platform[]): void {
  for (let i = 0; i < platforms.length; i++) {
    const p = platforms[i];
    if (p.kind !== 'solid') continue;
    if (!(b.y - b.h < p.bottom - EPS && b.y > p.top + EPS)) continue;
    if (!overlapsX(b, p)) continue;
    const pushLeft = b.x + b.hw - p.x; // distance to move left to clear
    const pushRight = p.right - (b.x - b.hw); // distance to move right to clear
    if (b.x < p.x + p.w / 2 && pushLeft <= pushRight) {
      b.x -= pushLeft;
      b.wall = 1;
    } else {
      b.x += pushRight;
      b.wall = -1;
    }
  }
}

/** Resolve vertical overlap after a y step. Returns true if the body landed (b.y snapped to a top). */
function resolveY(b: Body, platforms: readonly Platform[], sy: number): boolean {
  for (let i = 0; i < platforms.length; i++) {
    const p = platforms[i];
    if (p.kind === 'solid') {
      if (!overlapsX(b, p)) continue;
      const inY = b.y > p.top + EPS && b.y - b.h < p.bottom - EPS;
      if (!inY) continue;
      if (sy >= 0) {
        if (footOverlaps(b, p) && b.startBottom <= p.prevY + 1) {
          b.y = p.top;
          return true;
        }
      } else if (b.y - b.h < p.bottom && b.startBottom - b.h >= p.bottom - 1) {
        b.y = p.bottom + b.h;
        b.hitCeil = true;
      }
    } else {
      // one-way: only catches from above
      if (sy < 0 && p.dy >= 0) continue;
      if (b.y < p.top - EPS) continue;
      if (!footOverlaps(b, p)) continue;
      if (b.startBottom <= p.prevY + 0.5) {
        b.y = p.top;
        return true;
      }
    }
  }
  return false;
}

/** After horizontal ground movement: keep standing, hop to an adjacent surface, or start falling. */
function updateSupport(b: Body, platforms: readonly Platform[]): void {
  const gp = b.groundPlat;
  if (gp && footOverlaps(b, gp)) {
    b.y = gp.top;
    return;
  }
  for (let i = 0; i < platforms.length; i++) {
    const p = platforms[i];
    if (Math.abs(p.top - b.y) < 0.75 && footOverlaps(b, p)) {
      b.groundPlat = p;
      b.y = p.top;
      return;
    }
  }
  b.grounded = false;
  b.groundPlat = null;
}

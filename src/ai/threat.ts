import { hitboxRect, hurtRect } from '../engine/combat';
import type { Fighter } from '../engine/fighter';
import { hitboxEnd, hitboxStart, moveTotal, type MoveDef } from '../engine/moves';
import type { World } from '../engine/world';
import { attackDecel } from './moveInfo';

/** What is about to hit us: frames until it lands, whether it is a grab / projectile, where it comes from. */
export interface Threat {
  eta: number;
  grab: boolean;
  proj: boolean;
  fromX: number;
  /** The attacker (-1 for a projectile / blast). */
  owner: number;
  /** Damage of the hit (shield-health awareness: a strong hit on a weak shield breaks it). */
  damage: number;
  /** Frames the hit stays out once it starts (multi-frame active windows are worth dodging rather than shielding). */
  lasts: number;
}

/** Frames ahead the CPU looks for projectiles (Havoc's mortar falls from high up, so it needs a little longer). */
const PROJ_LOOKAHEAD = 30;
/** Frames ahead it looks for melee hitboxes. */
const MELEE_LOOKAHEAD = 20;

const rA = [0, 0, 0, 0];
const rB = [0, 0, 0, 0];

/**
 * Per-move cumulative forward travel by move frame, for a grounded attacker (lunges, dash attacks, Shark Lunge): the hitbox
 * of a lunge comes out further forward than where the attacker stands now. Cached per character and move.
 */
const curveCache = new Map<string, Float32Array>();
function travelCurve(o: Fighter, m: MoveDef): Float32Array | null {
  if (!m.motion) return null;
  const key = `${o.data.id}:${m.id}`;
  let c = curveCache.get(key);
  if (c) return c;
  const total = moveTotal(m);
  c = new Float32Array(total + 2);
  const decel = attackDecel(o.data);
  let v = 0;
  let d = 0;
  for (let f = 1; f <= total + 1; f++) {
    for (const st of m.motion) if (st.frame === f && st.vx !== undefined) v = st.mode === 'add' ? v + st.vx : st.vx;
    d += v;
    v = v > 0 ? Math.max(0, v - decel) : Math.min(0, v + decel);
    c[f] = d;
  }
  curveCache.set(key, c);
  return c;
}

function overlap(a: number[], b: number[], m: number): boolean {
  return a[0] - m < b[0] + b[2] && a[0] + a[2] + m > b[0] && a[1] - m < b[1] + b[3] && a[1] + a[3] + m > b[1];
}

/**
 * Looks for anything about to hit `self`: rival hitboxes in their wind-up / active frames (moved by the lunge the move still
 * has to travel, and by our own drift), and projectiles simulated forward a few frames with their gravity, drag and blast
 * radius (lobbed and falling shots like a mortar shell are caught, not only straight bolts). Fills `out`; true if found.
 */
export function detectThreat(self: Fighter, world: World, out: Threat): boolean {
  hurtRect(self, rB);
  const selfVx = self.vx;
  const selfVy = self.grounded ? 0 : self.vy;
  let found = false;
  const consider = (eta: number, grab: boolean, proj: boolean, fromX: number, owner: number, damage: number, lasts: number): void => {
    if (found && eta >= out.eta) return;
    found = true;
    out.eta = eta;
    out.grab = grab;
    out.proj = proj;
    out.fromX = fromX;
    out.owner = owner;
    out.damage = damage;
    out.lasts = lasts;
  };
  for (let i = 0; i < world.fighters.length; i++) {
    const o = world.fighters[i];
    if (o === self || o.state !== 'attack' || !o.move || world.allied(self.id, o.id)) continue;
    if (Math.abs(o.x - self.x) > 200 || Math.abs(o.y - self.y) > 160) continue;
    const m = o.move;
    const curve = o.grounded ? travelCurve(o, m) : null;
    const hbs = m.hitboxes;
    for (let k = 0; k < hbs.length; k++) {
      const hb = hbs[k];
      if ((hb.damage <= 0 && !hb.grab) || hb.throw) continue;
      const a = hitboxStart(m, hb);
      const e = hitboxEnd(m, hb);
      if (o.moveFrame > e || a - o.moveFrame > MELEE_LOOKAHEAD) continue;
      const eta = Math.max(0, a - o.moveFrame);
      hitboxRect(o, hb, rA);
      // the attacker's own travel until the hitbox comes out (a lunge), or its drift in the air
      let shiftX = 0;
      let shiftY = 0;
      if (curve) {
        const f0 = Math.min(curve.length - 1, Math.max(0, o.moveFrame));
        const f1 = Math.min(curve.length - 1, Math.max(0, a));
        shiftX = (curve[f1] - curve[f0]) * o.facing;
      } else if (!o.grounded) {
        shiftX = o.vx * eta;
        shiftY = o.vy * eta * 0.6;
      }
      rA[0] += shiftX - selfVx * eta;
      rA[1] += shiftY - selfVy * eta * 0.5;
      if (overlap(rA, rB, 8)) consider(eta, !!hb.grab, false, o.x, o.id, hb.damage, e - Math.max(a, o.moveFrame) + 1);
    }
  }
  for (let i = 0; i < world.projectiles.length; i++) {
    const p = world.projectiles[i];
    if (!p.active || p.owner === self.id || !p.def || world.allied(self.id, p.owner)) continue;
    if (Math.abs(self.x - p.x) > 260 || Math.abs(self.y - p.y) > 260) continue;
    const d = p.def;
    const r = d.blast ? d.blast.radius * 0.8 : 0;
    const hw = d.w / 2 + r;
    const hh = d.h / 2 + r;
    let x = p.x;
    let y = p.y;
    let vx = p.vx;
    let vy = p.vy;
    const left = d.life - p.age;
    const n = Math.min(PROJ_LOOKAHEAD, left);
    for (let t = 1; t <= n; t++) {
      if (!d.path) {
        vy = Math.min(d.maxFall ?? Infinity, vy + (d.gravity ?? 0));
        vx *= 1 - (d.drag ?? 0);
        y += vy;
      }
      x += vx;
      // our body then (drifting the way we are moving)
      const bx = rB[0] + selfVx * t;
      const by = rB[1] + selfVy * t * 0.5;
      if (x + hw > bx - 6 && x - hw < bx + rB[2] + 6 && y + hh > by - 6 && y - hh < by + rB[3] + 6) {
        consider(Math.max(0, t - 1), false, true, p.x, -1, (d.blast?.hit ?? d.hit).damage, 1);
        break;
      }
    }
  }
  return found;
}

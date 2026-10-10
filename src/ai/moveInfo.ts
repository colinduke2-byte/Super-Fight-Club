import { moveTotal } from '../engine/moves';
import type { CharacterData } from '../engine/types';

/** What the CPU needs to know about one normal move, derived from its frame data. */
export interface AiMove {
  id: string;
  /** Position in the character's table (for per-move counters without string keys). */
  index: number;
  kind: 'jab' | 'tilt' | 'smash' | 'aerial' | 'grab';
  startup: number;
  active: number;
  total: number;
  /** Damage of the strongest hitbox plus a share of the rest (multi-hit moves). */
  dmg: number;
  /** Strongest single hit (compared against an opponent's armor threshold). */
  maxHit: number;
  /** Launch strength proxy: base + scaling. */
  power: number;
  /** Union of hitboxes, forward-relative to the fighter's feet. */
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  charge: boolean;
}

/** The stick direction and button that start each normal. */
export interface MoveInput {
  /** -1 back, 0 neutral, 1 forward (relative to facing). */
  fwd: -1 | 0 | 1;
  up: -1 | 0 | 1;
  button: 'attack' | 'smash' | 'grab';
  /** Half-pressed stick (tilts): full deflection in the same frame would be read as a smash flick. */
  tilt?: boolean;
}

export const NORMAL_INPUTS: Record<string, MoveInput> = {
  jab1: { fwd: 0, up: 0, button: 'attack' },
  ftilt: { fwd: 1, up: 0, button: 'attack', tilt: true },
  utilt: { fwd: 0, up: -1, button: 'attack', tilt: true },
  dtilt: { fwd: 0, up: 1, button: 'attack', tilt: true },
  fsmash: { fwd: 1, up: 0, button: 'smash' },
  usmash: { fwd: 0, up: -1, button: 'smash' },
  dsmash: { fwd: 0, up: 1, button: 'smash' },
  nair: { fwd: 0, up: 0, button: 'attack' },
  fair: { fwd: 1, up: 0, button: 'attack' },
  bair: { fwd: -1, up: 0, button: 'attack' },
  uair: { fwd: 0, up: -1, button: 'attack' },
  dair: { fwd: 0, up: 1, button: 'attack' },
  grab: { fwd: 0, up: 0, button: 'grab' },
};

const cache = new Map<string, AiMove[]>();

/** Analyse a character's normals once. */
export function moveTable(data: CharacterData): AiMove[] {
  const hit = cache.get(data.id);
  if (hit) return hit;
  const out: AiMove[] = [];
  for (const id of Object.keys(NORMAL_INPUTS)) {
    const m = data.moves[id];
    if (!m || m.hidden) continue;
    const hbs = m.hitboxes.filter((h) => !h.throw);
    if (hbs.length === 0) continue;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let best = 0;
    let rest = 0;
    let power = 0;
    for (const h of hbs) {
      minX = Math.min(minX, h.x - h.w / 2);
      maxX = Math.max(maxX, h.x + h.w / 2);
      minY = Math.min(minY, h.y - h.h / 2);
      maxY = Math.max(maxY, h.y + h.h / 2);
      if (h.damage > best) {
        rest += best * 0.4;
        best = h.damage;
        power = h.base + h.scaling;
      } else rest += h.damage * 0.4;
    }
    // jab strings: count the follow-up hits (the CPU keeps pressing while they connect)
    let chainDmg = 0;
    let chainFrames = 0;
    for (let nx = m.next ? data.moves[m.next.id] : undefined, n = 0; nx && n < 4; nx = nx.next ? data.moves[nx.next.id] : undefined, n++) {
      chainDmg += Math.max(0, ...nx.hitboxes.map((h) => h.damage)) * 0.7;
      chainFrames += nx.next ? nx.next.at : moveTotal(nx);
    }
    out.push({
      id,
      index: out.length,
      kind: m.kind === 'grab' ? 'grab' : (m.kind as AiMove['kind']),
      startup: m.startup,
      active: m.active,
      total: moveTotal(m) + chainFrames * 0.5,
      dmg: best + rest + chainDmg,
      maxHit: best,
      power,
      minX,
      maxX,
      minY,
      maxY,
      charge: !!m.charge,
    });
  }
  cache.set(data.id, out);
  return out;
}

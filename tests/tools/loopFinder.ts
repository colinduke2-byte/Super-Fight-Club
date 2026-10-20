/**
 * Infinite / loop finder for cancel routes. Builds each fighter's cancel graph (MoveDef.cancels; a jump cancel '@jump'
 * leads to every aerial), enumerates its simple cycles, and plays each cycle over and over against a standing dummy,
 * taking every route as early as it opens (hit-confirmed) and following the dummy. A cycle is a true loop when the dummy
 * never leaves hitstun: the true combo keeps growing until the run ends.
 */
import { CHARACTERS } from '../../src/characters';
import { Button, type FighterInput, makeInput } from '../../src/engine/buttons';
import { Fighter } from '../../src/engine/fighter';
import type { MoveCancel } from '../../src/engine/moves';
import { World } from '../../src/engine/world';
import { STAGES } from '../../src/stages';

export interface Edge {
  from: string;
  to: string;
  /** The route taken (for a jump cancel: the jump route; the aerial is then input normally). */
  route: MoveCancel;
  jump: boolean;
}

const AERIALS = ['nair', 'fair', 'bair', 'uair', 'dair'];

export function cancelGraph(id: string): Edge[] {
  const moves = CHARACTERS[id].moves;
  const out: Edge[] = [];
  for (const [from, m] of Object.entries(moves)) {
    for (const c of m.cancels ?? []) {
      if (c.into === '@jump') {
        for (const a of AERIALS) if (moves[a]) out.push({ from, to: a, route: c, jump: true });
      } else if (moves[c.into] || Object.keys(moves).some((k) => k.startsWith(`${c.into}_`))) out.push({ from, to: c.into, route: c, jump: false });
    }
  }
  return out;
}

/** Simple cycles (as edge lists) up to `maxLen` edges. */
export function cycles(edges: Edge[], maxLen = 4): Edge[][] {
  const out: Edge[][] = [];
  const nodes = [...new Set(edges.map((e) => e.from))].sort();
  const seen = new Set<string>();
  const walk = (start: string, at: string, path: Edge[]): void => {
    if (path.length > maxLen) return;
    for (const e of edges) {
      if (e.from !== at) continue;
      if (e.to === start) {
        const cyc = [...path, e];
        const key = cyc.map((x) => `${x.from}>${x.to}${x.jump ? 'j' : ''}`).sort().join(',');
        if (!seen.has(key)) {
          seen.add(key);
          out.push(cyc);
        }
        continue;
      }
      if (e.to < start || path.some((p) => p.from === e.to)) continue; // each cycle once, from its smallest node
      walk(start, e.to, [...path, e]);
    }
  };
  for (const n of nodes) walk(n, n, []);
  return out;
}

const stickFor = (c: MoveCancel, facing: number, inp: FighterInput): void => {
  const d = c.dir ?? 'any';
  inp.stickX = d === 'forward' || d === 'side' ? facing : d === 'back' ? -facing : 0;
  inp.stickY = d === 'up' ? -1 : d === 'down' ? 1 : 0;
};

/** Play `cycle` repeatedly against a dummy at `pct`; returns the longest true combo seen (hits). */
export function playCycle(id: string, cycle: Edge[], pct: number, dummyId = id === 'nova' ? 'vex' : 'nova', frames = 900): number {
  const world = new World(STAGES.classic);
  world.config.smashFlick = false;
  const p = new Fighter(0, CHARACTERS[id]);
  const d = new Fighter(1, CHARACTERS[dummyId]);
  world.addFighter(p);
  world.addFighter(d);
  const g = world.platforms[0];
  p.standOn(g, -80);
  d.standOn(g, -80 + 20);
  p.facing = 1;
  d.facing = -1;
  p.invuln = d.invuln = 0;
  d.damage = pct;
  const inp = makeInput();
  const idle = makeInput();
  let best = 0;
  let k = 0; // index of the edge to take next
  let jumping = false;
  if (!p.startMove(cycle[0].from, null, world)) return 0;
  for (let i = 0; i < frames; i++) {
    inp.pressed = inp.held = inp.released = 0;
    inp.stickX = inp.stickY = 0;
    const e = cycle[k % cycle.length];
    const toward = d.x >= p.x ? 1 : -1;
    if (jumping) {
      // jump cancel taken: throw the aerial once airborne, drifting under / at the dummy
      if (p.state === 'air') {
        inp.stickX = Math.abs(d.x - p.x) > 6 ? toward : 0;
        if (p.vy > -3 || Math.abs(d.y - d.h / 2 - (p.y - p.h / 2)) < 20) {
          inp.pressed = inp.held = Button.Attack;
          const a = e.to;
          inp.stickX = a === 'fair' ? p.facing : a === 'bair' ? -p.facing : 0;
          inp.stickY = a === 'uair' ? -1 : a === 'dair' ? 1 : 0;
        }
      }
      if (p.state === 'attack' && p.move?.id === e.to) {
        jumping = false;
        k++;
      }
    } else if (p.state === 'attack' && p.move && (p.move.id === e.from || p.move.id.startsWith(`${e.from}_`)) && p.moveHit && p.moveFrame + 1 >= e.route.from) {
      const b = e.route.button;
      const mask = b === 'attack' ? Button.Attack : b === 'special' ? Button.Special : b === 'smash' ? Button.Smash : b === 'grab' ? Button.Grab : Button.Jump;
      inp.pressed = inp.held = mask;
      stickFor(e.route, p.facing, inp);
      if (e.jump) inp.stickX = 0;
    } else if (p.state === 'attack' && p.move && (p.move.id === e.to || p.move.id.startsWith(`${e.to}_`)) && !e.jump) k++;
    else if (p.state === 'jumpsquat' || (e.jump && p.state === 'air' && !jumping)) jumping = e.jump;
    else if (p.state !== 'attack' && p.state !== 'air') break; // dropped out of the string
    world.step([inp, idle]);
    best = Math.max(best, d.trueCombo + (d.state === 'hitstun' ? 1 : 0));
    if (d.state !== 'hitstun' && d.hitlag <= 0 && d.state !== 'grabbed' && i > 30) break;
    if (d.state === 'ko') break;
  }
  return best;
}

export interface LoopReport {
  fighter: string;
  cycle: string;
  pct: number;
  hits: number;
}

/** Every cycle of every fighter at a few percents; reports those whose true combo reaches `limit` hits. */
export function findLoops(limit = 16, ids = Object.keys(CHARACTERS).filter((c) => c !== 'overseer')): LoopReport[] {
  const out: LoopReport[] = [];
  for (const id of ids) {
    for (const cyc of cycles(cancelGraph(id))) {
      for (const pct of [0, 40, 80]) {
        const hits = playCycle(id, cyc, pct);
        if (hits >= limit) out.push({ fighter: id, cycle: cyc.map((e) => `${e.from}>${e.jump ? 'jump>' : ''}${e.to}`).join(' '), pct, hits });
      }
    }
  }
  return out;
}

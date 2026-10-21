/**
 * Point-blank probes: does a move connect against an opponent standing inside the attacker, and how much time do CPU fighters
 * spend overlapped in real matches? Used by tests/combatFeel.test.ts (assertions) and tests/tools/pointBlankReport.test.ts
 * (POINTBLANK=1 prints the full whiff table).
 */
import { CpuController } from '../../src/ai/cpu';
import { CHARACTERS } from '../../src/characters';
import { makeInput } from '../../src/engine/buttons';
import { hitboxActive, hitboxRect, hurtRect } from '../../src/engine/combat';
import { Fighter } from '../../src/engine/fighter';
import { Match } from '../../src/engine/match';
import { World } from '../../src/engine/world';
import { STAGES } from '../../src/stages';
import { sandboxStage } from '../../src/stages/sandbox';

export const FIGHTERS = Object.keys(CHARACTERS).filter((c) => !c.startsWith('overseer'));
export const GROUND_MOVES = ['jab1', 'ftilt', 'utilt', 'dtilt', 'dashAttack', 'fsmash', 'usmash', 'dsmash', 'grab'];
export const AIR_MOVES = ['nair', 'fair', 'bair', 'uair', 'dair'];
/** Point-blank placements: defender x relative to the attacker, attacker facing. */
export const OFFSETS = [-4, 0, 4];

export type WhyMiss = 'hit' | 'front-gap' | 'behind' | 'vertical' | 'blocked';

const NEUTRAL = makeInput();
const INS = [NEUTRAL, NEUTRAL];

function pair(a: string, b: string, air: boolean): { world: World; fa: Fighter; fb: Fighter } {
  const world = new World(sandboxStage);
  const fa = new Fighter(0, CHARACTERS[a]);
  const fb = new Fighter(1, CHARACTERS[b]);
  world.addFighter(fa);
  world.addFighter(fb);
  fa.spawn(0, -1, 1);
  fb.spawn(0, -1, -1);
  for (let i = 0; i < 6; i++) world.step(INS);
  if (air) {
    for (const f of [fa, fb]) {
      f.y = -280;
      f.grounded = false;
      f.groundPlat = null;
      f.vy = 0;
      f.setState('air');
    }
  }
  return { world, fa, fb };
}

const rA = [0, 0, 0, 0];
const rB = [0, 0, 0, 0];

/** Attacker `a` uses `move` with defender `b` standing at `dx` (attacker facing `facing`). Returns why it hit / missed. */
export function pointBlank(a: string, b: string, move: string, dx: number, facing: 1 | -1): WhyMiss {
  const air = AIR_MOVES.includes(move);
  const { world, fa, fb } = pair(a, b, air);
  fa.x = 0;
  fb.x = dx;
  fa.facing = facing;
  fb.facing = (dx >= 0 ? -1 : 1) as 1 | -1;
  fa.invuln = fb.invuln = 0;
  if (!fa.data.moves[move]) return 'hit';
  fa.startMove(move, null, world);
  const m = fa.move!;
  let hit = false;
  let why: WhyMiss = 'front-gap';
  let sawX = false;
  const dmg0 = fb.damage;
  for (let t = 0; t < 90 && fa.move === m; t++) {
    if (fa.state === 'attack' && fa.hitlag === 0) {
      hurtRect(fb, rB);
      for (const hb of m.hitboxes) {
        if (hb.throw || !hitboxActive(fa, m, hb)) continue;
        hitboxRect(fa, hb, rA);
        const xOk = rA[0] < rB[0] + rB[2] && rA[0] + rA[2] > rB[0];
        if (xOk) sawX = true;
      }
    }
    world.step(INS);
    if (fb.damage > dmg0 || fb.state === 'grabbed' || fb.state === 'hitstun') {
      hit = true;
      break;
    }
  }
  if (hit) return 'hit';
  if (sawX) why = 'vertical';
  else if ((fb.x - fa.x) * fa.facing < 0) why = 'behind';
  return why;
}

export interface MutualResult {
  none: number;
  one: number;
  trade: number;
  clank: number;
  total: number;
}

/** Both fighters start a grounded normal on the same tick while overlapped. */
export function mutual(a: string, b: string, ma: string, mb: string, dx: number, fa0: 1 | -1, fb0: 1 | -1): 'none' | 'one' | 'trade' | 'clank' {
  const { world, fa, fb } = pair(a, b, false);
  fa.x = 0;
  fb.x = dx;
  fa.facing = fa0;
  fb.facing = fb0;
  fa.invuln = fb.invuln = 0;
  let clank = false;
  world.listener = (t) => {
    if (t === 'clank') clank = true;
  };
  fa.startMove(ma, null, world);
  fb.startMove(mb, null, world);
  const da = fa.damage;
  const db = fb.damage;
  let ha = false;
  let hb = false;
  for (let t = 0; t < 80; t++) {
    world.step(INS);
    if (fa.damage > da || fa.state === 'grabbed') ha = true;
    if (fb.damage > db || fb.state === 'grabbed') hb = true;
    if (fa.state !== 'attack' && fb.state !== 'attack' && fa.hitlag === 0 && fb.hitlag === 0) break;
  }
  if (ha && hb) return 'trade';
  if (ha || hb) return 'one';
  return clank ? 'clank' : 'none';
}

export interface OverlapStats {
  ticks: number;
  /** Ticks both fighters were grounded on the same platform with bodies more than half overlapped. */
  overlapTicks: number;
  /** Overlapped ticks where at least one was attacking and nobody got hit within the episode. */
  dryAttackTicks: number;
  episodes: number[];
}

/** CPU vs CPU stock match (no items) measuring body overlap. */
export function overlapMatch(chars: [string, string], stage: string, skill: number, seed: number, maxTicks = 7200): OverlapStats {
  const world = new World(STAGES[stage]);
  const fs = chars.map((c, i) => new Fighter(i, CHARACTERS[c]));
  fs.forEach((f) => world.addFighter(f));
  const match = new Match(world, { mode: 'stock', stocks: 3, timeLimitSec: 0, respawnDelay: 70 });
  const sp = STAGES[stage].spawns;
  const place = (f: Fighter, air = false): void => f.spawn(sp[f.id].x, sp[f.id].y - (air ? 130 : 1), sp[f.id].x <= 0 ? 1 : -1);
  fs.forEach((f) => place(f));
  match.onRespawn = (f) => place(f, true);
  let hits = 0;
  world.listener = (type, f, _x, _y, _m, extra) => {
    if (type === 'hit' || type === 'grab' || type === 'shieldHit') hits++;
    if (type === 'ko') match.onKo(f, extra);
  };
  const cpus = chars.map((_, i) => new CpuController(3, seed * 7 + i + 1, skill));
  const ins = fs.map(() => makeInput());
  const st: OverlapStats = { ticks: 0, overlapTicks: 0, dryAttackTicks: 0, episodes: [] };
  let run = 0;
  let runAttack = 0;
  let runHits = 0;
  const close = (): void => {
    if (run > 0) {
      st.episodes.push(run);
      if (hits === runHits) st.dryAttackTicks += runAttack;
    }
    run = 0;
    runAttack = 0;
  };
  for (let tick = 0; tick < maxTicks && !match.over; tick++) {
    fs.forEach((f, i) => cpus[i].update(f, world, ins[i]));
    world.step(ins);
    match.step();
    st.ticks++;
    const [a, b] = fs;
    const reach = (a.hw * a.sizeMul + b.hw * b.sizeMul) * 0.5;
    const over = a.grounded && b.grounded && a.groundPlat === b.groundPlat && a.state !== 'ko' && b.state !== 'ko' && Math.abs(a.x - b.x) < reach;
    if (over) {
      if (run === 0) runHits = hits;
      run++;
      st.overlapTicks++;
      if (a.state === 'attack' || b.state === 'attack') runAttack++;
    } else close();
  }
  close();
  return st;
}

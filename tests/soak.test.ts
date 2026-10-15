import { describe, expect, it } from 'vitest';
import { CpuController } from '../src/ai/cpu';
import { CHARACTERS } from '../src/characters';
import { makeInput } from '../src/engine/buttons';
import { MatchRunner } from '../src/game/runner';
import { STAGES } from '../src/stages';

const ids = Object.keys(CHARACTERS);

/** Every 4-character lineup from the roster (and rotations of it) brawls as Hard CPUs; nobody may get stuck or produce bad numbers. */
function lineups(): string[][] {
  const out: string[][] = [];
  for (let start = 0; start < ids.length; start++) out.push([0, 1, 2, 3].map((k) => ids[(start + k) % ids.length])); // four consecutive fighters, every rotation
  return out;
}

function brawl(lineup: string[], stage: string, seed: number, ticks: number): { hash: number; maxHold: number } {
  const r = new MatchRunner({ stage: STAGES[stage], characters: lineup, rules: { mode: 'stock', stocks: 3, timeLimitSec: 0, respawnDelay: 70 } });
  const { world, fighters: fs } = r;
  const cpus = fs.map((_, i) => new CpuController(3, seed * 10 + i + 1));
  const ins = fs.map(() => makeInput());
  const held = fs.map(() => 0);
  let maxHold = 0;
  for (let t = 0; t < ticks && !r.over; t++) {
    fs.forEach((f, i) => cpus[i].update(f, world, ins[i]));
    r.step(ins);
    fs.forEach((f, i) => {
      held[i] = f.state === 'grabbed' || f.state === 'holding' || f.state === 'frozen' || f.state === 'stunned' ? held[i] + 1 : 0;
      maxHold = Math.max(maxHold, held[i]);
      expect(Number.isFinite(f.x) && Number.isFinite(f.y) && Number.isFinite(f.vx) && Number.isFinite(f.vy), `${lineup[i]} has a non-finite position at tick ${t}`).toBe(true);
    });
  }
  return { hash: world.hash(), maxHold };
}

describe('content soak: every 4-fighter lineup', () => {
  for (const lineup of lineups()) {
    it(`${lineup.join(' / ')} brawl without getting stuck, and replay identically`, () => {
      const a = brawl(lineup, 'reactor', 1, 3000);
      expect(a.maxHold, 'a fighter stayed grabbed / frozen / stunned for too long').toBeLessThan(500);
      const b = brawl(lineup, 'reactor', 1, 3000);
      expect(b.hash).toBe(a.hash);
    }, 120_000);
  }
});

describe('new stages soak', () => {
  for (const stage of ['storm', 'skyhold', 'temple', 'frostfang', 'stormrunner']) {
    it(`${stage}: a brawl stays finite and replays identically`, () => {
      const lineup = stage === 'frostfang' || stage === 'stormrunner' ? ['rime', 'havoc', 'gizmo', 'obelisk'] : ['halcyon', 'brick', 'vex', 'nova'];
      const a = brawl(lineup, stage, 2, 3000);
      expect(a.maxHold).toBeLessThan(500);
      expect(brawl(lineup, stage, 2, 3000).hash).toBe(a.hash);
    }, 120_000);
  }
});

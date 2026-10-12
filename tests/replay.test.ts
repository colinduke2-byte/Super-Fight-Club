import { describe, expect, it } from 'vitest';
import { CpuController } from '../src/ai/cpu';
import { CHARACTERS } from '../src/characters';
import { makeInput } from '../src/engine/buttons';
import { Fighter } from '../src/engine/fighter';
import { Match } from '../src/engine/match';
import { World } from '../src/engine/world';
import { fillReplayInputs, ReplayRecorder } from '../src/game/replay';
import { DEFAULT_RULES } from '../src/game/session';
import { STAGES } from '../src/stages';

function play(stage: string, chars: string[], drive: (tick: number, ins: ReturnType<typeof makeInput>[], fs: Fighter[], w: World) => boolean, ticks: number) {
  const world = new World(STAGES[stage]);
  const fs = chars.map((c, i) => new Fighter(i, CHARACTERS[c]));
  fs.forEach((f) => world.addFighter(f));
  const match = new Match(world, { mode: 'stock', stocks: 2, timeLimitSec: 0, respawnDelay: 70 });
  const sp = STAGES[stage].spawns;
  const place = (f: Fighter, air = false): void => f.spawn(sp[f.id].x, sp[f.id].y - (air ? 130 : 1), sp[f.id].x <= 0 ? 1 : -1);
  fs.forEach((f) => place(f));
  match.onRespawn = (f) => place(f, true);
  world.listener = (t, f, _x, _y, _m, extra) => {
    if (t === 'ko') match.onKo(f, extra);
  };
  const ins = fs.map(() => makeInput());
  for (let t = 0; t < ticks && !match.over; t++) {
    if (!drive(t, ins, fs, world)) break;
    world.step(ins);
    match.step();
  }
  return world.hash();
}

describe('replays', () => {
  it('feeding recorded inputs into the same setup reproduces the match exactly', () => {
    const chars = ['halcyon', 'brick', 'vex'];
    const rec = new ReplayRecorder('storm', { ...DEFAULT_RULES }, chars.map((character) => ({ character })), true);
    const cpus = chars.map((_, i) => new CpuController(3, 7 + i));
    const live = play('storm', chars, (_t, ins, fs, w) => {
      fs.forEach((f, i) => cpus[i].update(f, w, ins[i]));
      rec.record(ins);
      return true;
    }, 2400);
    const replay = rec.finish();
    expect(replay.ticks).toBeGreaterThan(100);
    const again = play('storm', chars, (t, ins) => fillReplayInputs(replay, t, ins), replay.ticks);
    expect(again).toBe(live);
  });
});

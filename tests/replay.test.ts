import { describe, expect, it } from 'vitest';
import { CpuController } from '../src/ai/cpu';
import { makeInput } from '../src/engine/buttons';
import type { Fighter } from '../src/engine/fighter';
import type { World } from '../src/engine/world';
import { fillReplayInputs, ReplayRecorder } from '../src/game/replay';
import { MatchRunner } from '../src/game/runner';
import { DEFAULT_RULES } from '../src/game/session';
import { STAGES } from '../src/stages';

function play(stage: string, chars: string[], drive: (tick: number, ins: ReturnType<typeof makeInput>[], fs: Fighter[], w: World) => boolean, ticks: number) {
  const r = new MatchRunner({ stage: STAGES[stage], characters: chars, rules: { mode: 'stock', stocks: 2, timeLimitSec: 0, respawnDelay: 70 } });
  const ins = r.fighters.map(() => makeInput());
  for (let t = 0; t < ticks && !r.over; t++) {
    if (!drive(t, ins, r.fighters, r.world)) break;
    r.step(ins);
  }
  return r.world.hash();
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
  }, 120000); // two 2400-tick matches: a few seconds alone, far longer on a loaded machine (a timeout, not a mismatch)
});

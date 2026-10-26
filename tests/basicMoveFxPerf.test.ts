import inspector from 'node:inspector';
import { describe, expect, it } from 'vitest';
import { CpuController } from '../src/ai/cpu';
import { CHARACTERS } from '../src/characters';
import { makeInput } from '../src/engine/buttons';
import { Fighter } from '../src/engine/fighter';
import { World } from '../src/engine/world';
import { STAGES } from '../src/stages';
import { makeSwing, swingOf, swingVisible } from '../src/fx/basicFx';
import { updateFighterFx } from '../src/fx/runner';
import { drawSwing, type Deco } from '../src/ui/MoveFx';
import type { Effects } from '../src/ui/Effects';

interface ProfileNode {
  callFrame: { functionName: string; url: string };
  selfSize: number;
  children: ProfileNode[];
}

/**
 * The basic-move presentation runs every sim tick for every fighter (touch particles, charge sparks, trail geometry): it must
 * not make garbage. Particles and graphics are stand-ins here; what is measured is the fx code's own allocation.
 */
describe('basic move fx allocation budget', () => {
  it('trail geometry and touches for a busy 4-player match allocate (almost) nothing per tick', async () => {
    const world = new World(STAGES.classic);
    const ids = ['agni', 'halcyon', 'nova', 'riptide'];
    const fs = ids.map((c, i) => new Fighter(i, CHARACTERS[c]));
    fs.forEach((f, i) => {
      world.addFighter(f);
      f.spawn(STAGES.classic.spawns[i].x, -1, i % 2 ? -1 : 1);
    });
    const cpus = fs.map((_, i) => new CpuController(3, i + 1));
    const ins = fs.map(() => makeInput());
    let calls = 0;
    const nop = (): void => {
      calls++;
    };
    const fx = { emit: nop, burst: nop, flash: nop, ring: nop, dust: nop, kickDust: nop, trail: nop, shaped: nop, density: 1 } as unknown as Effects;
    const g: Record<string, unknown> = {};
    for (const k of ['fillStyle', 'lineStyle', 'fillPoints', 'strokePoints', 'lineBetween', 'fillTriangle', 'fillRect']) g[k] = () => g;
    const swing = makeSwing();
    const deco: Deco[] = Array.from({ length: 8 }, () => ({ x: 0, y: 0, t: 0, nx: 0, ny: 0 }));
    const LAYERS = [[1.5, 0xff0000, 0.3], [1, 0x00ff00, 0.7], [0.5, 0xffffff, 0.9]] as const;
    let drawn = 0;
    const present = (): void => {
      updateFighterFx(world, fx, world.tick, () => {});
      for (const f of world.fighters) {
        const m = f.move;
        if (f.state !== 'attack' || !m) continue;
        for (const hb of m.hitboxes) {
          if (!swingVisible(f, m, hb)) continue;
          const s = swingOf(f, m, hb, swing);
          if (s.look.shape !== 'none') {
            drawSwing(g as never, f, s, LAYERS, 1, world.tick, deco, 0xffffff);
            drawn++;
          }
        }
      }
    };
    const run = (n: number): void => {
      for (let t = 0; t < n; t++) {
        fs.forEach((f, i) => cpus[i].update(f, world, ins[i]));
        world.step(ins);
        present();
      }
    };
    run(600);
    const s = new inspector.Session();
    s.connect();
    const post = <T>(m: string, p?: object): Promise<T> => new Promise((res, rej) => s.post(m, p, (e: Error | null, r?: object) => (e ? rej(e) : res(r as T))));
    await post('HeapProfiler.enable');
    const TICKS = 6000;
    const measure = async (): Promise<number> => {
      await post('HeapProfiler.startSampling', { samplingInterval: 128, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
      run(TICKS);
      const { profile } = await post<{ profile: { head: ProfileNode } }>('HeapProfiler.stopSampling');
      let ours = 0;
      const walk = (n: ProfileNode): void => {
        if (n.callFrame.url.includes('/src/fx/') || n.callFrame.url.includes('/src/ui/MoveFx')) ours += n.selfSize;
        n.children.forEach(walk);
      };
      walk(profile.head);
      return ours / TICKS;
    };
    let best = Infinity;
    for (let a = 0; a < 3 && best >= 64; a++) best = Math.min(best, await measure());
    s.disconnect();
    expect(drawn).toBeGreaterThan(500); // the CPUs did attack
    expect(calls).toBeGreaterThan(500); // and the touches fired
    expect(best).toBeLessThan(64);
  }, 120000);
});

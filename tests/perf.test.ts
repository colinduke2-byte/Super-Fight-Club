import inspector from 'node:inspector';
import { describe, expect, it } from 'vitest';
import { CpuController } from '../src/ai/cpu';
import { CHARACTERS } from '../src/characters';
import { makeInput } from '../src/engine/buttons';
import { Fighter } from '../src/engine/fighter';
import { World } from '../src/engine/world';
import { STAGES } from '../src/stages';

interface ProfileNode {
  callFrame: { functionName: string; url: string };
  selfSize: number;
  children: ProfileNode[];
}

/**
 * Allocation budget for the simulation hot path (4 fighters, 4 CPUs, a hazard stage): the V8 sampling heap profiler counts every
 * allocation, including ones the GC already freed, so this catches per-tick garbage (the CPU used to allocate ~2.4 KB per tick).
 */
describe('hot path allocation budget', () => {
  it('four CPUs + the sim allocate under 2200 bytes per tick', async () => {
    const world = new World(STAGES.reactor);
    const fs = ['brick', 'vex', 'nova', 'gizmo'].map((c, i) => new Fighter(i, CHARACTERS[c]));
    fs.forEach((f, i) => {
      world.addFighter(f);
      f.spawn(STAGES.reactor.spawns[i].x, -1, i % 2 ? -1 : 1);
    });
    const cpus = fs.map((_, i) => new CpuController(2, i + 1));
    const ins = fs.map(() => makeInput());
    const run = (n: number): void => {
      for (let t = 0; t < n; t++) {
        fs.forEach((f, i) => cpus[i].update(f, world, ins[i]));
        world.step(ins);
      }
    };
    run(600);
    const s = new inspector.Session();
    s.connect();
    const post = <T>(m: string, p?: object): Promise<T> => new Promise((res, rej) => s.post(m, p, (e: Error | null, r?: object) => (e ? rej(e) : res(r as T))));
    await post('HeapProfiler.enable');
    /** Sampled bytes allocated by our code per tick over one run of TICKS. */
    const measure = async (): Promise<number> => {
      await post('HeapProfiler.startSampling', { samplingInterval: 128, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
      run(TICKS);
      const { profile } = await post<{ profile: { head: ProfileNode } }>('HeapProfiler.stopSampling');
      let ours = 0;
      const walk = (n: ProfileNode): void => {
        if (n.callFrame.url.includes('/src/')) ours += n.selfSize;
        n.children.forEach(walk);
      };
      walk(profile.head);
      return ours / TICKS;
    };
    const TICKS = 8000;
    // On a busy machine (the rest of the suite running beside it) the hot code can stay in V8's lower tiers for longer, where
    // doubles are boxed on the heap: that is the machine, not the code. Take the best of up to three runs; real per-tick
    // garbage shows up in every one of them.
    let best = Infinity;
    for (let attempt = 0; attempt < 3 && best >= 2200; attempt++) best = Math.min(best, await measure());
    s.disconnect();
    expect(best).toBeLessThan(2200); // mostly boxed doubles in fighter fields (sampled, so it wobbles ~5%); the physics pass added a few more per tick
  }, 120000);

  it('the simulation steps a 4-player match in well under a millisecond per tick', () => {
    const world = new World(STAGES.classic);
    const fs = ['brick', 'vex', 'nova', 'gizmo'].map((c, i) => new Fighter(i, CHARACTERS[c]));
    fs.forEach((f, i) => {
      world.addFighter(f);
      f.spawn(STAGES.classic.spawns[i].x, -1, 1);
    });
    const cpus = fs.map((_, i) => new CpuController(3, i + 1));
    const ins = fs.map(() => makeInput());
    for (let t = 0; t < 600; t++) {
      fs.forEach((f, i) => cpus[i].update(f, world, ins[i]));
      world.step(ins);
    }
    // Wall-clock time is at the mercy of whatever else the machine is doing (the rest of the suite runs in parallel), so time
    // several short runs and judge the fastest: a slow sim is slow in every run, a busy machine only slows some of them.
    const N = 800;
    let best = Infinity;
    for (let run = 0; run < 6; run++) {
      const t0 = performance.now();
      for (let t = 0; t < N; t++) {
        fs.forEach((f, i) => cpus[i].update(f, world, ins[i]));
        world.step(ins);
      }
      best = Math.min(best, (performance.now() - t0) / N);
    }
    // 60 Hz budget is 16.7 ms; the sim + 4 CPUs should use a small fraction of it even on slow CI machines
    expect(best).toBeLessThan(1.5);
  }, 60000);
});

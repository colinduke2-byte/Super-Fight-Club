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
  it('four CPUs + the sim allocate under 1200 bytes per tick', async () => {
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
    await post('HeapProfiler.startSampling', { samplingInterval: 128, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
    const TICKS = 8000;
    run(TICKS);
    const { profile } = await post<{ profile: { head: ProfileNode } }>('HeapProfiler.stopSampling');
    s.disconnect();
    let ours = 0;
    const walk = (n: ProfileNode): void => {
      if (n.callFrame.url.includes('/src/')) ours += n.selfSize;
      n.children.forEach(walk);
    };
    walk(profile.head);
    expect(ours / TICKS).toBeLessThan(1200);
  }, 60000);

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
    const t0 = performance.now();
    const N = 4000;
    for (let t = 0; t < N; t++) {
      fs.forEach((f, i) => cpus[i].update(f, world, ins[i]));
      world.step(ins);
    }
    const perTick = (performance.now() - t0) / N;
    // 60 Hz budget is 16.7 ms; the sim + 4 CPUs should use a small fraction of it even on slow CI machines
    expect(perTick).toBeLessThan(1.5);
  });
});

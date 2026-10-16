import { describe, expect, it } from 'vitest';
import { catchErrors } from '../src/crashGuard';

// One exception in a scene's update used to stop Phaser's game loop for good (it only asks for the next frame after the
// frame callback returns): the scene steps are wrapped so an error is reported and the loop carries on.
describe('catchErrors', () => {
  it('passes calls through and returns their result', () => {
    const o = { k: 2, f(x: number) { return x * this.k; } };
    const seen: unknown[] = [];
    catchErrors(o, 'f', (e) => seen.push(e));
    expect(o.f(3)).toBe(6);
    expect(seen).toEqual([]);
  });

  it('catches an exception, reports it with the receiver, and the next call still runs', () => {
    let calls = 0;
    const sys = {
      key: 'Match',
      step() {
        calls++;
        if (calls === 1) throw new TypeError("Cannot read properties of undefined (reading 'x')");
      },
    };
    const seen: [unknown, unknown][] = [];
    catchErrors(sys, 'step', (e, self) => seen.push([e, self]));
    expect(() => sys.step()).not.toThrow();
    sys.step();
    expect(calls).toBe(2);
    expect(seen).toHaveLength(1);
    expect((seen[0][0] as Error).message).toMatch(/reading 'x'/);
    expect(seen[0][1]).toBe(sys);
  });

  it('reports the same error from the same source at most once per throttle window, but other sources at once', () => {
    let t = 0;
    const proto = {
      step(this: { key: string }) {
        throw new Error(`boom in ${this.key}`.replace(/ in .*/, ''));
      },
    };
    const seen: string[] = [];
    catchErrors(proto, 'step', (_e, self) => seen.push((self as { key: string }).key), { throttleMs: 1000, keyOf: (s) => (s as { key: string }).key, now: () => t });
    const a = Object.create(proto) as { key: string; step(): void };
    a.key = 'A';
    const b = Object.create(proto) as { key: string; step(): void };
    b.key = 'B';
    for (let i = 0; i < 60; i++) {
      a.step(); // every frame
      t += 16;
    }
    b.step();
    expect(seen).toEqual(['A', 'B']);
    t += 1000;
    a.step();
    expect(seen).toEqual(['A', 'B', 'A']);
  });
});

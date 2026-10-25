import { describe, expect, it } from 'vitest';
import { placeTag } from '../src/ui/tagPlacement';

describe('name tag placement', () => {
  it('leaves a lone tag where it is', () => {
    expect(placeTag([], [], 0, 100, 50, 20, 22)).toEqual([100, 50]);
  });

  it('slides a slightly overlapping tag aside and stacks a fully overlapping one above', () => {
    const [x] = placeTag([100, 50, 20], [], 1, 130, 50, 20, 22);
    expect(x).toBeGreaterThanOrEqual(140 - 0.5);
    expect(placeTag([100, 50, 20], [], 1, 100, 50, 20, 22)).toEqual([100, 28]);
  });

  it('finishes when two fighters share a spot whose stacked gap rounds a hair under the gap (it used to spin forever)', () => {
    // py - (py - 22) is 21.999999999999545 here: the old check read the stacked tag as still touching and restacked it
    const py = -4078.6763467186925;
    const gap = 22;
    expect(Math.abs(py - (py - gap))).toBeLessThan(gap);
    const placed = [500, py, 20, 500, py - gap, 20];
    const [x, y] = placeTag(placed, [], 2, 500, py, 20, gap);
    expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
    expect(y).toBeLessThan(py - gap + 0.5);
  });

  it('settles four fighters stacked on one point, at any scale', () => {
    for (const u of [0.8, 1.4, 2, 3]) {
      const gap = 11 * u;
      const placed: number[] = [];
      for (let id = 0; id < 4; id++) {
        const [x, y] = placeTag(placed, [], id, 9771.198954914535, -7983.811809012087, 12 * u, gap);
        placed.push(x, y, 12 * u);
      }
      expect(placed.length).toBe(12);
    }
  });
});

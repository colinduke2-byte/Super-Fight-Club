import { describe, expect, it } from 'vitest';
import { AdaptiveQuality } from '../src/ui/adaptiveQuality';

function feed(a: AdaptiveQuality, ms: number, frames: number, q: 'high' | 'medium' | 'low' = 'high'): (string | null)[] {
  const out: (string | null)[] = [];
  for (let i = 0; i < frames; i++) out.push(a.observe(ms, q));
  return out;
}

describe('adaptive particle quality', () => {
  it('stays put while the game holds 60 fps', () => {
    const a = new AdaptiveQuality();
    expect(feed(a, 16.7, 2000).every((x) => x === null)).toBe(true);
    expect(a.cap).toBeNull();
  });
  it('steps down after sustained slow frames, once per cooldown', () => {
    const a = new AdaptiveQuality();
    const r = feed(a, 30, 90 * 2);
    expect(r.filter(Boolean)).toEqual(['medium']);
    // still slow right after: cooldown prevents an immediate second drop
    expect(feed(a, 30, 300).filter(Boolean)).toEqual([]);
    expect(feed(a, 30, 90 * 6).filter(Boolean)).toEqual(["low"]);
    expect(feed(a, 30, 3000).filter(Boolean)).toEqual([]); // already at the floor
  });
  it('ignores a single hitch (tab switch, shader compile)', () => {
    const a = new AdaptiveQuality();
    feed(a, 16.7, 80);
    a.observe(900, 'high');
    expect(feed(a, 16.7, 1000).every((x) => x === null)).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { characterById } from '../src/characters';
import { HOW_TO_PLAY } from '../src/game/howToPlay';

describe('How to Play pages', () => {
  it('every page fits the panel and demos a real fighter', () => {
    expect(HOW_TO_PLAY.length).toBeGreaterThanOrEqual(5);
    for (const p of HOW_TO_PLAY) {
      expect(p.rows.length).toBeGreaterThan(0);
      expect(p.rows.length).toBeLessThanOrEqual(8);
      const c = characterById(p.demo[0]);
      expect(c, p.title).toBeDefined();
      for (const pose of p.demo[1]) expect(Object.keys(c!.sprite.animations ?? {}), `${p.title}:${pose}`).toContain(pose);
      for (const [k, d] of p.rows) {
        expect(k.length).toBeLessThanOrEqual(26);
        expect(d.length).toBeLessThanOrEqual(62);
      }
    }
  });
});

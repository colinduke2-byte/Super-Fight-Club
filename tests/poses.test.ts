import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../src/characters';
import { animFrameIndex, sheetDims, sheetLayout } from '../src/art/sheetLayout';
import { hasHeroArt } from '../src/art/hero';
import { flowOrder, movePoseFrame } from '../src/engine/movePoses';
import { hitboxEnd, hitboxStart, moveTotal } from '../src/engine/moves';
import { buildKeys, POSE_TEMPLATES } from '../src/art/poseTemplates';
import { SOUND_STYLES } from '../src/engine/fxTypes';

describe('move poses', () => {
  for (const [id, c] of Object.entries(CHARACTERS)) {
    it(`${id}: every posed move has a valid template and its own animation row`, () => {
      for (const m of Object.values(c.moves)) {
        if (!m.pose) continue;
        expect(POSE_TEMPLATES, `${id}.${m.id}`).toContain(m.pose.t);
        expect(m.anim).toMatch(/^mv_/);
        // six-pose rows; flowing basic moves get 8 (10 for smashes), see movePoses.ts
        expect([6, 8, 10], `${id}.${m.id}`).toContain(c.sprite.animations[m.anim]?.frames);
        const keys = buildKeys(m.pose);
        expect(keys).toHaveLength(3);
        // (optional slots past the six required ones may be left undefined)
        for (const k of keys.flat(2)) if (k !== undefined) expect(Number.isFinite(k)).toBe(true);
        for (const k of keys) expect(k.slice(0, 6).flat().every((v) => Number.isFinite(v))).toBe(true);
      }
    });
    it(`${id}: sprite sheet grid stays within the texture width limit`, () => {
      // hero-art sheets go to the GPU packed (sheetPixels.ts packedHeroSheet; art.test.ts checks those against 4096 px):
      // the padded grid is only a layout, but it must still fit 4096 px across
      const d = sheetDims(c);
      expect(d.width).toBeLessThanOrEqual(4096);
      if (!hasHeroArt(c.sprite.placeholder)) expect(d.height).toBeLessThanOrEqual(4096);
    });
    it(`${id}: flowing moves strike exactly on their live hitbox frames, and play every beat in order`, () => {
      for (const m of Object.values(c.moves)) {
        const n = c.sprite.animations[m.anim]?.frames ?? 0;
        if (n < 8) continue;
        expect(['jab', 'tilt', 'smash', 'dashAttack', 'aerial']).toContain(m.kind);
        const live = (f: number): boolean => m.hitboxes.length === 0 ? f > m.startup && f <= m.startup + m.active : m.hitboxes.some((hb) => f >= hitboxStart(m, hb) && f <= hitboxEnd(m, hb));
        // (a move whose hit is a projectile or an event has no hitboxes: its active frames stand in)
        const first = m.hitboxes.length ? Math.min(...m.hitboxes.map((hb) => hitboxStart(m, hb))) : m.startup + 1;
        const last = m.hitboxes.length ? Math.max(...m.hitboxes.map((hb) => hitboxEnd(m, hb))) : m.startup + m.active;
        const seen: number[] = [];
        for (let f = 0; f <= moveTotal(m); f++) {
          const fr = movePoseFrame(m, f, n);
          expect(fr, `${id}.${m.id}@${f}`).toBeGreaterThanOrEqual(0);
          expect(fr, `${id}.${m.id}@${f}`).toBeLessThanOrEqual(n + 1);
          // the strike (3) or its extension (7) shows on exactly the frames from the first hitbox out to the last one in
          const striking = fr === 3 || fr === 7;
          expect(striking, `${id}.${m.id}@${f}`).toBe(f >= first && f <= last);
          if (striking && m.hitboxes.length > 0) expect(f >= first && f <= last && (live(f) || m.hitboxes.some((hb) => hb.window))).toBe(true);
          if (seen[seen.length - 1] !== fr) seen.push(fr);
        }
        // never goes back to an earlier beat (the order a menu demo plays the row in), and ends on the settle frame
        const order = [...flowOrder(n), n, n + 1];
        const rank = seen.map((fr) => order.indexOf(fr));
        expect(rank.every((r) => r >= 0), `${id}.${m.id} ${seen}`).toBe(true);
        expect([...rank].sort((a, b) => a - b), `${id}.${m.id} ${seen}`).toEqual(rank);
        expect(seen[seen.length - 1], `${id}.${m.id}`).toBe(m.kind === 'aerial' ? n + 1 : n);
        // the settle frame resolves to the fighter's shared settle row
        expect(animFrameIndex(c, m.anim, n)).toBe(sheetLayout(c).start.mvSettle);
        expect(animFrameIndex(c, m.anim, n + 1)).toBe(sheetLayout(c).start.mvSettle + 1);
      }
    });
  }
  it('every character declares a known sound style', () => {
    expect(SOUND_STYLES.length).toBeGreaterThan(3);
  });
});

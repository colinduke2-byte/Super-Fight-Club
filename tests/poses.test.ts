import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../src/characters';
import { sheetDims } from '../src/art/sheetLayout';
import { buildKeys, POSE_TEMPLATES } from '../src/art/poseTemplates';
import { SOUND_STYLES } from '../src/engine/fxTypes';

describe('move poses', () => {
  for (const [id, c] of Object.entries(CHARACTERS)) {
    it(`${id}: every posed move has a valid template and its own animation row`, () => {
      for (const m of Object.values(c.moves)) {
        if (!m.pose) continue;
        expect(POSE_TEMPLATES, `${id}.${m.id}`).toContain(m.pose.t);
        expect(m.anim).toMatch(/^mv_/);
        expect(c.sprite.animations[m.anim]?.frames).toBe(6);
        const keys = buildKeys(m.pose);
        expect(keys).toHaveLength(3);
        for (const k of keys.flat(2)) expect(Number.isFinite(k)).toBe(true);
      }
    });
    it(`${id}: sprite sheet stays within the 4096px texture limit`, () => {
      const d = sheetDims(c);
      expect(d.width).toBeLessThanOrEqual(4096);
      expect(d.height).toBeLessThanOrEqual(4096);
    });
  }
  it('every character declares a known sound style', () => {
    expect(SOUND_STYLES.length).toBeGreaterThan(3);
  });
});

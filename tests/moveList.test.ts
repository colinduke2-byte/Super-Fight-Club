import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../src/characters';
import { moveList, moveListText } from '../src/game/moveList';

describe('move list', () => {
  it('lists every fighter\'s core moves with an input, a name and a first active frame', () => {
    for (const c of Object.values(CHARACTERS)) {
      const rows = moveList(c);
      expect(rows.length, c.id).toBeGreaterThanOrEqual(18);
      for (const r of rows) {
        expect(r.name.length).toBeGreaterThan(0);
        expect(r.frame).toBeGreaterThan(0);
      }
      expect(moveListText(c)).toContain('MOVE LIST');
    }
  });
});

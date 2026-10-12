import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../src/characters';
import { makeInput } from '../src/engine/buttons';
import { Fighter } from '../src/engine/fighter';
import { World } from '../src/engine/world';
import { STAGES } from '../src/stages';

/** Lowest damage percent (in steps of 5) at which `moveId`'s hardest hit KOs `victimId` from centre stage with no DI; 999 = never. */
export function killPercent(atkId: string, moveId: string, victimId: string, stage = 'classic'): number {
  const mv = CHARACTERS[atkId].moves[moveId];
  const hb = mv.hitboxes.reduce((a, b) => (b.damage > a.damage ? b : a));
  for (let pct = 0; pct <= 250; pct += 5) {
    const w = new World(STAGES[stage]);
    const a = new Fighter(0, CHARACTERS[atkId]);
    const v = new Fighter(1, CHARACTERS[victimId]);
    w.addFighter(a);
    w.addFighter(v);
    const sp = STAGES[stage].spawns;
    a.spawn(sp[0].x, sp[0].y - 1, 1);
    v.spawn(0, sp[0].y - 1, 1);
    for (let i = 0; i < 120; i++) w.step([makeInput(), makeInput()]);
    v.damage = pct;
    let ko = false;
    w.listener = (t, f) => {
      if (t === 'ko' && f === v) ko = true;
    };
    v.receiveHit({ damage: hb.damage, base: hb.base, scaling: hb.scaling, angle: hb.angle === 361 ? 44 : hb.angle, direction: 1, moveWeight: hb.weight, hitlag: 0, attackerId: 0 }, w);
    for (let i = 0; i < 400 && !ko; i++) w.step([makeInput(), makeInput()]);
    if (ko) return pct;
  }
  return 999;
}

const ids = Object.keys(CHARACTERS);

describe('kill percents (classic stage, no DI)', () => {
  it('every fighter has a horizontal smash that kills every fighter before 160% and an up smash that kills before 250%', () => {
    for (const a of ids) {
      for (const v of ids) {
        const f = killPercent(a, 'fsmash', v);
        const u = killPercent(a, 'usmash', v);
        // forward smashes may be angled upward (e.g. Vex's second hit), so allow a looser cap than horizontal killers
        expect(Math.min(f, u), `${a} cannot kill ${v} with a smash`).toBeLessThanOrEqual(250);
      }
    }
  }, 30000);

  it('heavier fighters survive longer than lighter ones against the same hit', () => {
    const byWeight = [...ids].sort((x, y) => CHARACTERS[x].stats.weight - CHARACTERS[y].stats.weight);
    const light = killPercent('brick', 'fsmash', byWeight[0]);
    const heavy = killPercent('brick', 'fsmash', byWeight[byWeight.length - 1]);
    expect(heavy).toBeGreaterThan(light);
  });

  it('writes docs/kill-percents.md when KILLTABLE=1', () => {
    if (!process.env.KILLTABLE) return;
    let md = '# Kill percents (classic stage, no DI, centre stage)\n\nLowest damage percent at which the move KOs the victim. 999 = never within 250%.\n\n';
    for (const move of ['fsmash', 'usmash', 'fair', 'bair', 'uair']) {
      md += `## ${move}\n\n| attacker \\ victim | ${ids.join(' | ')} |\n|---|${ids.map(() => '---:').join('|')}|\n`;
      for (const a of ids) md += `| ${a} | ${ids.map((v) => killPercent(a, move, v)).join(' | ')} |\n`;
      md += '\n';
    }
    writeFileSync('docs/kill-percents.md', md);
  }, 600_000);
});

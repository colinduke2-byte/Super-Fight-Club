import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../src/characters';
import { ITEM_KINDS } from '../src/engine/items';
import { HOW_TO_PLAY, ITEM_NAMES, howToPlayPages } from '../src/game/howToPlay';
import { moveList, moveListText } from '../src/game/moveList';
import { LESSONS, deviceKind } from '../src/game/tutorial';
import type { InputDevice } from '../src/input/device';
import { lastInput } from '../src/input/lastDevice';

const dev = (o: object): InputDevice => ({ id: 'x', label: 'x', connected: true, sample: () => undefined, ...o }) as unknown as InputDevice;
const KB1 = dev({ kind: 'keyboard', scheme: 'kb1' });
const PAD = dev({ kind: 'gamepad', padId: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 02fd)' });
const TOUCH = dev({ kind: 'touch' });

describe('tutorial lessons', () => {
  it('name each device in plain words (no run-together STICK UPSTICK LEFT)', () => {
    for (const d of [KB1, PAD, TOUCH]) {
      for (const l of LESSONS) {
        const g = l.goal(d);
        expect(g.length, l.id).toBeGreaterThan(10);
        expect(g, l.id).not.toMatch(/STICK \w+STICK/);
        expect(g, l.id).not.toContain('UNBOUND');
      }
    }
    expect(LESSONS[0].goal(KB1)).toContain('A / D');
    const goal = (id: string, d: InputDevice) => LESSONS.find((l) => l.id === id)!.goal(d);
    expect(goal('jump', TOUCH)).toContain('PRESS JUMP');
    expect(goal('jump', PAD)).toMatch(/PRESS [ABXY] TO JUMP/);
    expect(goal('jump', KB1)).toContain('PRESS W TO JUMP'); // W jumps on a keyboard by default
    expect(goal('sprint', KB1)).toContain('DOUBLE-TAP A / D');
    expect(goal('recover', KB1)).toContain('W + K');
  });

  it('a merged keyboard + pad player follows the device used last', () => {
    const was = lastInput.kind;
    lastInput.kind = 'gamepad';
    expect(deviceKind(dev({ kind: 'merged' }))).toBe('gamepad');
    lastInput.kind = was;
    expect(deviceKind(TOUCH)).toBe('touch');
  });
});

describe('How to Play', () => {
  it('has a controls page for the device in use and a touch page', () => {
    const titles = HOW_TO_PLAY.map((p) => p.title);
    expect(titles).toContain('TOUCH');
    const was = lastInput.kind;
    lastInput.kind = 'keyboard';
    const kb = howToPlayPages().find((p) => p.title === 'KEYBOARD');
    expect(kb?.rows.map((r) => r.join(' ')).join(' ')).toContain('WASD');
    lastInput.kind = 'touch';
    const touch = howToPlayPages();
    expect(touch[1].title).toBe('TOUCH');
    expect(touch.filter((p) => p.title === 'TOUCH')).toHaveLength(1);
    lastInput.kind = was;
  });

  it('names every item as Versus Setup does, and the stage page has its own demo', () => {
    for (const k of ITEM_KINDS) expect(ITEM_NAMES[k], k).toBeTruthy();
    expect(ITEM_NAMES.heal).toBe('MED-KIT');
    expect(ITEM_NAMES.core).toBe('CORE FRAGMENT');
    const items = HOW_TO_PLAY.find((p) => p.title === 'ITEMS')!;
    const stages = HOW_TO_PLAY.find((p) => p.title === 'STAGES')!;
    expect(JSON.stringify(stages.demo)).not.toBe(JSON.stringify(items.demo));
  });
});

describe('move list', () => {
  it('shows the real inputs for the device', () => {
    const brick = CHARACTERS.brick;
    const kb = moveList(brick, KB1);
    expect(kb.find((r) => r.name === brick.moves.ftilt.name)?.input).toBe('A/D + J');
    expect(kb.map((r) => r.input).join(' ')).not.toContain('SIDE+ATTACK');
    expect(moveList(brick, PAD).find((r) => r.name === brick.moves.ftilt.name)?.input).toBe('SIDE + A');
    expect(moveList(brick, TOUCH).find((r) => r.name === brick.moves.ftilt.name)?.input).toBe('SIDE + ATTACK');
  });

  it('explains its columns and no longer ends in a key line over the HUD', () => {
    const t = moveListText(CHARACTERS.brick, KB1);
    expect(t).toContain('FRAME: HOW SOON IT HITS');
    expect(t).not.toContain('ANY BUTTON: BACK');
  });
});

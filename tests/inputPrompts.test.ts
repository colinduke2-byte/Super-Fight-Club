import { describe, expect, it } from 'vitest';
import { DEFAULT_KEY_SCHEMES, RESERVED_KEYS } from '../src/input/actions';
import { BindingStore, bindings } from '../src/input/bindings';
import { KeyboardDevice } from '../src/input/keyboard';
import { footerHint, keyLabel, menuPrompt, moveLabel, padButtonLabel, padStyleForId, promptFor } from '../src/input/prompts';
import { lastInput, notePad, noteTouch } from '../src/input/lastDevice';
import { PlayerInput, TAP_JUMP_WINDOW } from '../src/input/playerInput';
import { Button, makeInput } from '../src/engine/buttons';
import { settings } from '../src/settings';
import type { InputDevice, RawInput } from '../src/input/device';

function memStore(): Pick<Storage, 'getItem' | 'setItem'> & { data: Record<string, string> } {
  const data: Record<string, string> = {};
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
}

describe('key labels', () => {
  it('names keys the way they are printed', () => {
    expect(keyLabel('KeyJ')).toBe('J');
    expect(keyLabel('Digit7')).toBe('7');
    expect(keyLabel('ShiftRight')).toBe('RIGHT SHIFT');
    expect(keyLabel('Quote')).toBe('QUOTE');
    expect(keyLabel('Comma')).toBe('COMMA');
    expect(keyLabel('Numpad5')).toBe('NUM 5');
    expect(keyLabel('ArrowLeft')).toBe('LEFT');
    expect(keyLabel('Semicolon')).toBe('SEMICOLON'); // the pixel font has no ';'
    expect(keyLabel('PrintScreen')).toBe('PRINT SCREEN');
  });

  it('names pad buttons per pad family', () => {
    expect(padButtonLabel(0, 'xbox')).toBe('A');
    expect(padButtonLabel(1, 'nintendo')).toBe('A');
    expect(padButtonLabel(0, 'playstation')).toBe('CROSS');
    expect(padStyleForId('Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)')).toBe('playstation');
    expect(padStyleForId('Pro Controller (Vendor: 057e)')).toBe('nintendo');
    expect(padStyleForId('Xbox 360 Controller (XInput STANDARD GAMEPAD)')).toBe('xbox');
  });
});

describe('prompts follow bindings and the device', () => {
  it('keyboard prompts come from the live bindings, rebinds included', () => {
    const kb1 = new KeyboardDevice('kb1');
    expect(promptFor('attack', kb1)).toBe(keyLabel(bindings.keys.kb1.attack[0]));
    expect(menuPrompt('confirm', kb1)).toBe(`${keyLabel(bindings.keys.kb1.attack[0])} / ENTER`);
    const saved = [...bindings.keys.kb1.attack];
    bindings.keys.kb1.attack = ['KeyZ'];
    expect(promptFor('attack', kb1)).toBe('Z');
    expect(footerHint([['confirm', 'select'], ['back', 'back']], kb1)).toBe(`Z / ENTER: SELECT   ${keyLabel(bindings.keys.kb1.special[0])} / ESC: BACK`);
    bindings.keys.kb1.attack = saved;
    expect(moveLabel('kb1')).toBe('WASD');
    expect(moveLabel('kb2')).toBe('ARROWS');
  });

  it('pad and touch prompts track the last device used', () => {
    notePad('Pro Controller (Vendor: 057e)');
    expect(lastInput.kind).toBe('gamepad');
    expect(promptFor('attack')).toBe('A');
    expect(promptFor('special')).toBe('B');
    noteTouch();
    expect(promptFor('jump')).toBe('JUMP');
    expect(menuPrompt('confirm')).toBe('TAP');
  });
});

describe('keyboard 2 laptop defaults', () => {
  it('needs no numpad, pauses on Backspace, and never uses a match hotkey', () => {
    const k = DEFAULT_KEY_SCHEMES.kb2;
    for (const a of Object.keys(k) as (keyof typeof k)[]) expect(k[a][0].startsWith('Numpad')).toBe(false);
    expect(k.pause).toContain('Backspace');
    expect(Object.values(k).flat().filter((c) => RESERVED_KEYS.has(c))).toEqual([]);
    const kb1 = new Set(Object.values(DEFAULT_KEY_SCHEMES.kb1).flat());
    expect(Object.values(k).flat().filter((c) => kb1.has(c))).toEqual([]);
  });

  it('an old save still on the old kb2 defaults moves to the new ones; custom keys are kept', () => {
    const mem = memStore();
    const oldKb2 = {
      ...DEFAULT_KEY_SCHEMES.kb2,
      jump: ['KeyP'], // the player's own choice
      attack: ['Numpad1', 'Comma'],
      pause: ['NumpadEnter'],
    };
    mem.data['sfc.bindings.v1'] = JSON.stringify({ keys: { kb2: oldKb2 } });
    const s = new BindingStore(mem);
    s.load();
    expect(s.keys.kb2.jump).toEqual(['KeyP']);
    expect(s.keys.kb2.attack).toEqual(DEFAULT_KEY_SCHEMES.kb2.attack);
    expect(s.keys.kb2.pause).toEqual(DEFAULT_KEY_SCHEMES.kb2.pause);
  });

  it('rejects junk and duplicate keys in a save', () => {
    const mem = memStore();
    mem.data['sfc.bindings.v1'] = JSON.stringify({ v: 2, keys: { kb1: { attack: ['KeyJ', 5, null, 'KeyJ'] }, kb2: { attack: ['KeyJ', 'Comma'] } }, pads: { standard: { attack: [0, -1, 'x', 99] } } });
    const s = new BindingStore(mem);
    s.load();
    expect(s.keys.kb1.attack).toEqual(['KeyJ']);
    expect(s.keys.kb2.attack).toEqual(['Comma', 'Numpad1']); // KeyJ already drives keyboard 1: topped up with a free default
    expect(s.pads.standard.attack).toEqual([0]);
  });
});

describe('primary / alternate rebinding', () => {
  it('rebinding the primary keeps the alternate', () => {
    const s = new BindingStore(null);
    s.rebindKey('kb2', 'attack', 'KeyP');
    expect(s.keys.kb2.attack).toEqual(['KeyP', 'Numpad1']);
  });

  it('the alternate slot is set and cleared on its own', () => {
    const s = new BindingStore(null);
    s.rebindKey('kb1', 'attack', 'KeyZ', 1);
    expect(s.keys.kb1.attack).toEqual(['KeyJ', 'KeyZ']);
    s.rebindKey('kb1', 'attack', 'KeyZ', 0); // the alternate promoted: the two swap
    expect(s.keys.kb1.attack).toEqual(['KeyZ', 'KeyJ']);
    expect(s.clearKeySlot('kb1', 'attack', 1)).toBe(true);
    expect(s.keys.kb1.attack).toEqual(['KeyZ']);
    expect(s.clearKeySlot('kb1', 'attack', 0)).toBe(false); // never the last key
  });

  it('pad alternates survive a primary rebind', () => {
    const s = new BindingStore(null);
    s.rebindPadButton('standard', 'jump', 8);
    expect(s.pads.standard.jump).toEqual([8, 3]);
    s.rebindPadButton('standard', 'shield', 11, 1); // R3 was smash: smash takes shield's old alternate
    expect(s.pads.standard.shield).toEqual([6, 11]);
    expect(s.pads.standard.smash).toEqual([7]);
  });
});

describe('tap-jump per device kind', () => {
  class Fake implements InputDevice {
    readonly id = 'fake';
    readonly label = 'fake';
    readonly connected = true;
    stickY = 0;
    held = 0;
    constructor(readonly kind: InputDevice['kind']) {}
    sample(out: RawInput): void {
      out.stickX = 0;
      out.stickY = this.stickY;
      out.held = this.held;
    }
  }
  /** Runs a script of [stickY, held] ticks; returns per-tick (pressed Jump, held Jump, pressed buttons). */
  const run = (kind: InputDevice['kind'], ticks: [number, number][]) => {
    const d = new Fake(kind);
    const p = new PlayerInput(d);
    const out = makeInput();
    return ticks.map(([y, h]) => {
      d.stickY = y;
      d.held = h;
      p.sample(out);
      return { jumpPressed: (out.pressed & Button.Jump) !== 0, jumpHeld: (out.held & Button.Jump) !== 0, pressed: out.pressed };
    });
  };
  /** A flick up, held: did a jump come out within the tap window? */
  const flick = (kind: InputDevice['kind']) => run(kind, [[0, 0], ...Array.from({ length: TAP_JUMP_WINDOW + 1 }, (): [number, number] => [-1, 0])]).some((t) => t.jumpPressed);

  it('W / up jumps on keyboards by default, and on pads and touch', () => {
    expect(settings.upJumpKeyboard).toBe(true);
    expect(settings.tapJump).toBe(true);
    expect(flick('keyboard')).toBe(true);
    expect(flick('gamepad')).toBe(true);
    expect(flick('touch')).toBe(true);
    settings.upJumpKeyboard = false;
    expect(flick('keyboard')).toBe(false);
    settings.upJumpKeyboard = true;
  });

  it('a held flick is a full hop, a quick tap still jumps (short hop)', () => {
    const held = run('keyboard', [[0, 0], [-1, 0], [-1, 0], [-1, 0], [-1, 0]]);
    expect(held.filter((t) => t.jumpPressed).length).toBe(1);
    expect(held[held.length - 1].jumpHeld).toBe(true);
    const tap = run('keyboard', [[0, 0], [-1, 0], [0, 0], [0, 0], [0, 0]]);
    expect(tap.filter((t) => t.jumpPressed).length).toBe(1);
    expect(tap[tap.length - 1].jumpHeld).toBe(false);
  });

  it('up + Attack or Special within the window is the up move, not a jump', () => {
    for (const b of [Button.Attack, Button.Special, Button.Smash]) {
      for (let lag = 0; lag < TAP_JUMP_WINDOW; lag++) {
        const script: [number, number][] = [[0, 0], [-1, lag === 0 ? b : 0]];
        for (let i = 1; i <= lag; i++) script.push([-1, i === lag ? b : 0]);
        script.push([-1, b], [-1, b], [-1, b]);
        const ticks = run('keyboard', script);
        expect(ticks.some((t) => t.jumpPressed || t.jumpHeld)).toBe(false);
        expect(ticks.some((t) => (t.pressed & b) !== 0)).toBe(true);
      }
    }
  });

  it('a button pressed after the window does not cancel the jump (jump then aerial / up-special)', () => {
    const ticks = run('keyboard', [[0, 0], [-1, 0], [-1, 0], [-1, 0], [-1, Button.Special]]);
    expect(ticks.some((t) => t.jumpPressed)).toBe(true);
  });
});

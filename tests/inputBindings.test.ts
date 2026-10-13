import { describe, expect, it } from 'vitest';
import { DEFAULT_KEY_SCHEMES, RESERVED_KEYS } from '../src/input/actions';
import { BindingStore } from '../src/input/bindings';
import { InputManager } from '../src/input/inputManager';
import { KeyboardDevice, type KeyboardHub } from '../src/input/keyboard';
import { MenuInput } from '../src/input/menuInput';

function memStore(): Pick<Storage, 'getItem' | 'setItem'> & { data: Record<string, string> } {
  const data: Record<string, string> = {};
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
}

describe('rebinding conflicts', () => {
  it('swaps with the action of the same scheme that had the key', () => {
    const s = new BindingStore(null);
    const res = s.rebindKey('kb1', 'attack', 'KeyI'); // KeyI was jump, attack was KeyJ
    expect(res).toEqual({ ok: true, swappedWith: 'jump' });
    expect(s.keys.kb1.attack).toEqual(['KeyI']);
    expect(s.keys.kb1.jump).toEqual(['KeyJ']);
  });

  it('removes the key from the other keyboard scheme', () => {
    const s = new BindingStore(null);
    const res = s.rebindKey('kb1', 'grab', 'Comma'); // kb2 attack alternate
    expect(res).toEqual({ ok: true, takenFrom: { scheme: 'kb2', action: 'attack' } });
    expect(s.keys.kb1.grab).toEqual(['Comma']);
    expect(s.keys.kb2.attack).toEqual(['Numpad1']);
    const kb1 = new Set(Object.values(s.keys.kb1).flat());
    expect(Object.values(s.keys.kb2).flat().filter((c) => kb1.has(c))).toEqual([]);
  });

  it('refuses match hotkeys', () => {
    const s = new BindingStore(null);
    for (const code of ['BracketRight', 'KeyH', 'Digit1', 'Enter']) {
      const res = s.rebindKey('kb2', 'ultimate', code);
      expect(res.ok).toBe(false);
      expect(res.ok ? '' : res.reason).not.toBe('');
    }
    expect(s.keys.kb2.ultimate).toEqual(DEFAULT_KEY_SCHEMES.kb2.ultimate);
  });

  it('pad rebinding swaps and refuses the d-pad', () => {
    const s = new BindingStore(null);
    expect(s.rebindPadButton('standard', 'attack', 1)).toEqual({ ok: true, swappedWith: 'special' });
    expect(s.pads.standard.attack).toEqual([1]);
    expect(s.pads.standard.special).toEqual([0]);
    expect(s.rebindPadButton('standard', 'attack', 13).ok).toBe(false);
    expect(s.pads.standard.attack).toEqual([1]);
  });

  it('no default key is a match hotkey', () => {
    for (const scheme of Object.values(DEFAULT_KEY_SCHEMES)) {
      expect(Object.values(scheme).flat().filter((c) => RESERVED_KEYS.has(c))).toEqual([]);
    }
  });

  it('loading an old save drops reserved keys and restores free defaults', () => {
    const mem = memStore();
    const old = { ...DEFAULT_KEY_SCHEMES.kb2, ultimate: ['Numpad0', 'BracketRight'] };
    mem.data['sfc.bindings.v1'] = JSON.stringify({ keys: { kb2: old } });
    const s = new BindingStore(mem);
    s.load();
    expect(s.keys.kb2.ultimate).toEqual(['Numpad0', 'Backslash']);
  });
});

describe('InputManager pads', () => {
  it('a pad reconnecting at the same index keeps its device object', () => {
    const im = new InputManager();
    im.padConnected(0, 'Xbox Controller');
    const first = im.pads.get(0)!;
    im.padDisconnected(0);
    expect(im.pads.has(0)).toBe(false);
    im.padConnected(0, 'Xbox Controller');
    expect(im.pads.get(0)).toBe(first);
  });
});

describe('MenuInput', () => {
  function setup() {
    const held = new Set<string>();
    const hub = { isActive: (c: string) => held.has(c), isHeld: (c: string) => held.has(c) } as unknown as KeyboardHub;
    const keyboards = [new KeyboardDevice('kb1', hub), new KeyboardDevice('kb2', hub)];
    const im = { keyboards, allDevices: keyboards, endTick: () => undefined } as unknown as InputManager;
    let t = 1000;
    const menu = new MenuInput(im, hub, () => t);
    menu.reset();
    const step = (ms: number) => {
      t += ms;
      return [...menu.poll()];
    };
    return { held, keyboards, menu, step };
  }

  it('held directions repeat on a time basis, independent of frame rate', () => {
    for (const frame of [1000 / 60, 1000 / 144]) {
      const { held, step } = setup();
      held.add('KeyS');
      let fires = 0;
      const times: number[] = [];
      for (let el = 0; el <= 600; el += frame) {
        if (step(frame).some((e) => e.action === 'down')) {
          fires++;
          times.push(el);
        }
      }
      // press + repeats at ~333, ~416, ~500, ~583 ms
      expect(fires).toBe(5);
      expect(times[1]).toBeGreaterThanOrEqual(320);
      expect(times[1]).toBeLessThan(350);
    }
  });

  it('shared keys act for the only keyboard in use, then split by side once both are used', () => {
    const { held, keyboards, step } = setup();
    const tap = (code: string) => {
      held.add(code);
      const ev = step(16);
      held.delete(code);
      step(16);
      return ev;
    };
    expect(tap('Enter')[0].device).toBe(keyboards[0]); // nobody used yet: kb1
    tap('KeyJ'); // kb1 confirm
    expect(tap('Enter')[0].device).toBe(keyboards[0]);
    expect(tap('Space')[0].device).toBe(keyboards[0]);
    tap('ArrowDown'); // kb2 joins
    expect(tap('Enter')[0].device).toBe(keyboards[1]);
    expect(tap('Backspace')[0].device).toBe(keyboards[1]);
    expect(tap('Space')[0].device).toBe(keyboards[0]);
    expect(tap('Escape')[0].device).toBe(keyboards[0]);
    expect(tap('Tab')[0].device).toBe(keyboards[0]);
    tap('KeyD'); // kb1 again: still deterministic
    expect(tap('Enter')[0].device).toBe(keyboards[1]);
  });
});

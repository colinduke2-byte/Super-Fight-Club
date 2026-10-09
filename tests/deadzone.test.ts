import { describe, expect, it } from 'vitest';
import { applyRadialDeadzone } from '../src/input/deadzone';
import { profileForPadId } from '../src/input/actions';
import { BindingStore } from '../src/input/bindings';

describe('applyRadialDeadzone', () => {
  const out = { x: 0, y: 0 };
  it('zeroes values inside the deadzone', () => {
    applyRadialDeadzone(0.1, 0.1, 0.25, out);
    expect(out).toEqual({ x: 0, y: 0 });
  });
  it('rescales so output is continuous at the edge and reaches 1 at full tilt', () => {
    applyRadialDeadzone(0.2501, 0, 0.25, out);
    expect(out.x).toBeLessThan(0.01);
    applyRadialDeadzone(1, 0, 0.25, out);
    expect(out.x).toBeCloseTo(1);
    applyRadialDeadzone(0, -1, 0.25, out);
    expect(out.y).toBeCloseTo(-1);
  });
  it('clamps diagonal overshoot', () => {
    applyRadialDeadzone(1, 1, 0.2, out);
    expect(Math.hypot(out.x, out.y)).toBeCloseTo(1);
  });
});

describe('gamepad profiles', () => {
  it('detects Nintendo pads by vendor id or name', () => {
    expect(profileForPadId('Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)')).toBe('nintendo');
    expect(profileForPadId('Xbox 360 Controller (STANDARD GAMEPAD Vendor: 045e Product: 028e)')).toBe('standard');
    expect(profileForPadId('Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)')).toBe('standard');
    expect(profileForPadId('USB Gamepad')).toBe('standard');
  });
});

describe('BindingStore', () => {
  function memStore(): Pick<Storage, 'getItem' | 'setItem'> & { data: Record<string, string> } {
    const data: Record<string, string> = {};
    return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
  }

  it('rebinding removes the key from other actions and persists across reload', () => {
    const mem = memStore();
    const a = new BindingStore(mem);
    a.rebindKey('kb1', 'attack', 'KeyI'); // KeyI was jump
    expect(a.keys.kb1.jump).not.toContain('KeyI');
    expect(a.keys.kb1.attack).toEqual(['KeyI']);
    const b = new BindingStore(mem);
    b.load();
    expect(b.keys.kb1.attack).toEqual(['KeyI']);
    expect(b.keys.kb1.jump).not.toContain('KeyI');
  });

  it('survives corrupt storage', () => {
    const mem = memStore();
    mem.data['sfc.bindings.v1'] = '{not json';
    const s = new BindingStore(mem);
    expect(() => s.load()).not.toThrow();
    expect(s.keys.kb1.left).toEqual(['KeyA']);
  });

  it('the two default keyboard schemes share no keys', () => {
    const s = new BindingStore(null);
    const a = new Set(Object.values(s.keys.kb1).flat());
    const b = Object.values(s.keys.kb2).flat();
    expect(b.filter((c) => a.has(c))).toEqual([]);
  });
});

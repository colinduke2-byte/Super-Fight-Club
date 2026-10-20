import { afterEach, describe, expect, it } from 'vitest';
import { layoutUnit, TOUCH_MIN_UNIT, wantsRotate } from '../src/display';
import { fightLayout } from '../src/input/touch';
import { buttonMask, GamepadHub, padSample } from '../src/input/gamepad';
import { DEFAULT_PAD_PROFILES } from '../src/input/actions';
import { Button } from '../src/engine/buttons';
import { isDevCombo, promptScheme } from '../src/input/keyboard';
import { splitFooter, wrapText } from '../src/input/prompts';
import { DEFAULT_SETTINGS, settings, validateSettings } from '../src/settings';

describe('layout unit (width-aware, DPR-aware, touch minimum)', () => {
  it('keeps the familiar desktop units on 16:9 and ultrawide windows', () => {
    expect(layoutUnit(720, 1280)).toBe(2);
    expect(layoutUnit(1080, 1920)).toBe(3);
    expect(layoutUnit(1080, 2560)).toBe(3);
    expect(layoutUnit(1440, 2560)).toBe(4);
    // a Retina laptop (1440 x 900 CSS rendered at 2x) and a 4K screen rendered at half resolution
    expect(layoutUnit(1800, 2880, 2)).toBe(5);
    expect(layoutUnit(1080, 1920, 0.5)).toBe(3);
  });

  it('a portrait phone takes its unit from its width, and never drops below the touch minimum', () => {
    // 390 x 844 CSS at DPR 3: the height alone would give 7 render px (titles cut off at the sides)
    const u = layoutUnit(844 * 3, 390 * 3, 3, true);
    expect(u).toBeLessThan(7);
    expect(u / 3).toBeGreaterThanOrEqual(TOUCH_MIN_UNIT - 0.1);
    // a 640-art-pixel-wide title row at 4x fits... the menus' 480 x 360 safe area does: 480 art px x u <= width (or the touch floor)
    expect(Math.min(480 * (u / 3), 390)).toBeLessThanOrEqual(390);
  });

  it('a landscape phone gets bigger UI than its 390 CSS px height alone allowed (~1 CSS px per art px before)', () => {
    const u = layoutUnit(390 * 3, 844 * 3, 3, true);
    expect(u / 3).toBeGreaterThanOrEqual(1.3);
    // without a touch screen (a small desktop window) the old height-based size stays
    expect(layoutUnit(390, 844, 1, false)).toBe(1);
  });

  it('TEXT SIZE steps are real steps at 720p (75% no longer rounds to 100%)', () => {
    const steps = [0.75, 1, 1.25, 1.5].map((k) => layoutUnit(720, 1280, 1, false, k));
    expect(steps).toEqual([1.5, 2, 2.5, 3]);
    const at1080 = [0.75, 1, 1.25, 1.5].map((k) => layoutUnit(1080, 1920, 1, false, k));
    expect(new Set(at1080).size).toBe(4);
  });

  it('shows the rotate prompt only for a portrait touch screen in a match', () => {
    expect(wantsRotate(390, 844, true, true)).toBe(true);
    expect(wantsRotate(844, 390, true, true)).toBe(false);
    expect(wantsRotate(390, 844, true, false)).toBe(false); // menus work in portrait
    expect(wantsRotate(390, 844, false, true)).toBe(false); // a narrow desktop window
  });
});

describe('touch fight layout', () => {
  const opt = (o: Partial<{ size: number; left: boolean; stick: [number, number]; btn: [number, number] }> = {}) => ({ size: 1, left: false, stick: [0, 0] as [number, number], btn: [0, 0] as [number, number], ...o });
  const extent = (l: ReturnType<typeof fightLayout>) => {
    const ids = ['attack', 'special', 'shield', 'jump', 'grab', 'smash', 'ultimate'];
    return { minX: Math.min(...ids.map((i) => l.ctl[i].x - l.ctl[i].r)), maxX: Math.max(...ids.map((i) => l.ctl[i].x + l.ctl[i].r)), minY: Math.min(...ids.map((i) => l.ctl[i].y - l.ctl[i].r)) };
  };

  it('packs the arc into the corner on a landscape phone (leaves the right ledge visible)', () => {
    const l = fightLayout(844, 390, undefined, opt());
    const e = extent(l);
    // the cluster used to reach ~231 px in from the right edge (27% of the width); now under 205
    expect(844 - e.minX).toBeLessThan(205);
    expect(e.maxX).toBeLessThanOrEqual(844);
  });

  it('mirrors for left-handed players and scales with BUTTON SIZE', () => {
    const r = fightLayout(844, 390, undefined, opt());
    const l = fightLayout(844, 390, undefined, opt({ left: true }));
    expect(l.ctl.attack.x).toBeCloseTo(844 - r.ctl.attack.x);
    expect(l.home.x).toBeCloseTo(844 - r.home.x);
    expect(l.ctl.pause.x).toBe(r.ctl.pause.x); // pause stays top-right
    const big = fightLayout(844, 390, undefined, opt({ size: 1.3 }));
    expect(big.R).toBeCloseTo(r.R * 1.3);
  });

  it('a dragged cluster never leaves the screen', () => {
    const l = fightLayout(844, 390, undefined, opt({ btn: [0.6, 0.6] }));
    const e = extent(l);
    expect(e.maxX).toBeLessThanOrEqual(844 + 0.01);
    const up = fightLayout(844, 390, undefined, opt({ btn: [-0.6, -0.6] }));
    expect(extent(up).minY).toBeGreaterThanOrEqual(0);
  });
});

describe('gamepad press latching', () => {
  it('a press shorter than a frame is still seen once (latched between frames)', () => {
    const hub = new GamepadHub();
    const attack = DEFAULT_PAD_PROFILES.standard.attack[0];
    // polled between frames: the button went down and up again before the frame sampled the pad
    hub.latch(0, 1 << attack);
    const out = { stickX: 0, stickY: 0, held: 0 };
    padSample(out, 0, 0, 0 | hub.latched(0), DEFAULT_PAD_PROFILES.standard as unknown as Record<string, number[]>, 0.2);
    expect(out.held & Button.Attack).toBeTruthy();
    hub.clearLatches();
    padSample(out, 0, 0, 0 | hub.latched(0), DEFAULT_PAD_PROFILES.standard as unknown as Record<string, number[]>, 0.2);
    expect(out.held).toBe(0);
  });

  it('builds the button mask from pressed buttons and analog triggers', () => {
    const b = (pressed: boolean, value = pressed ? 1 : 0) => ({ pressed, value });
    expect(buttonMask([b(true), b(false), b(false, 0.7), b(false, 0.3)])).toBe(0b101);
    const out = { stickX: 0, stickY: 0, held: 0 };
    padSample(out, 0, 0, 1 << 14, DEFAULT_PAD_PROFILES.standard as unknown as Record<string, number[]>, 0.2);
    expect(out.stickX).toBe(-1); // d-pad left
  });
});

describe('keyboard prompts and dev combos', () => {
  it('arrows and the shared menu keys do not switch the prompts to keyboard 2', () => {
    expect(promptScheme('ArrowUp')).toBeNull();
    expect(promptScheme('Enter')).toBeNull();
    expect(promptScheme('Backspace')).toBeNull();
    expect(promptScheme('Comma')).toBe('kb2'); // keyboard 2's own attack does
    expect(promptScheme('KeyW')).toBe('kb1');
    expect(promptScheme('KeyJ')).toBe('kb1');
  });

  it('Ctrl / Alt + a match hotkey is the game\'s, Cmd or Shift combos are not', () => {
    const k = (code: string, m: Partial<{ ctrlKey: boolean; altKey: boolean; metaKey: boolean; shiftKey: boolean }>) => ({ code, ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, ...m });
    expect(isDevCombo(k('KeyF', { ctrlKey: true }))).toBe(true);
    expect(isDevCombo(k('Digit1', { ctrlKey: true }))).toBe(true);
    expect(isDevCombo(k('Digit1', { altKey: true }))).toBe(true);
    expect(isDevCombo(k('KeyF', { metaKey: true }))).toBe(false);
    expect(isDevCombo(k('KeyC', { ctrlKey: true }))).toBe(false); // copy stays the browser's
    expect(isDevCombo(k('KeyF', {}))).toBe(false);
  });
});

describe('narrow-screen text helpers', () => {
  it('splits a footer into two balanced lines at an entry boundary', () => {
    const two = splitFooter('UP/DOWN: MOVE   J / ENTER: SELECT   LEFT/RIGHT: CHANGE   K / ESC: BACK');
    const [a, b] = two.split('\n');
    expect(a).toBe('UP/DOWN: MOVE   J / ENTER: SELECT');
    expect(b).toBe('LEFT/RIGHT: CHANGE   K / ESC: BACK');
    expect(splitFooter('TAP: SELECT')).toBe('');
  });

  it('wraps at spaces', () => {
    expect(wrapText('A voice calls the countdown and the winner', 16)).toBe('A voice calls\nthe countdown\nand the winner');
  });
});

describe('touch settings', () => {
  afterEach(() => Object.assign(settings, DEFAULT_SETTINGS));
  it('validates and clamps the touch options', () => {
    const v = validateSettings({ touchSize: 9, touchOpacity: -1, touchLeftHanded: 'yes', touchStickX: 2 });
    expect(v.touchSize).toBe(1.5);
    expect(v.touchOpacity).toBe(0.2);
    expect(v.touchLeftHanded).toBe(false);
    expect(v.touchStickX).toBe(0.6);
  });
});

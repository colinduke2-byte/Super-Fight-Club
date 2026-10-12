import { Button } from '../engine/buttons';
import { makeRaw, type InputDevice, type RawInput } from './device';
import { inputManager, type InputManager } from './inputManager';
import { keyboardHub, type KeyboardHub } from './keyboard';

export type MenuAction = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back' | 'alt' | 'start';

export interface MenuEvent {
  action: MenuAction;
  device: InputDevice;
}

const STICK = 0.6;
const REPEAT_DELAY = 16; // frames before a held direction repeats
const REPEAT_RATE = 5;

const CONFIRM_BITS = Button.Attack | Button.Jump;
const BACK_BITS = Button.Special | Button.Shield;
const ALT_BITS = Button.Grab | Button.Smash | Button.Ultimate;

interface DevState {
  up: number; // frames held (0 = not held)
  down: number;
  left: number;
  right: number;
  confirm: boolean;
  back: boolean;
  alt: boolean;
  start: boolean;
}

/**
 * One menu input for every device: both keyboard schemes (WASD/JKLI and arrows/numpad, plus Enter / Space /
 * Escape / Tab), every connected gamepad. Each frame `poll()` returns discrete events (with auto-repeat
 * for held directions) tagged with the device that produced them, so character select can tell players apart.
 *
 * Mapping: confirm = Attack or Jump (J / I, pad face buttons); back = Special or Shield (K / L, B / bumpers);
 * alt = Grab / Smash / Ultimate; start = gamepad Start only.
 */
export class MenuInput {
  private readonly states = new Map<string, DevState>();
  private readonly raw: RawInput = makeRaw();
  private readonly events: MenuEvent[] = [];
  private readonly keyPrev = new Set<string>();
  private lastKeyboard: InputDevice;

  constructor(
    private readonly im: InputManager = inputManager,
    private readonly hub: KeyboardHub = keyboardHub,
  ) {
    this.lastKeyboard = im.keyboards[0];
  }

  /** Treat everything currently held as already handled (call when a scene starts). */
  reset(): void {
    this.states.clear();
    this.keyPrev.clear();
    for (const code of ['Enter', 'Space', 'Escape', 'Backspace', 'Tab']) if (this.hub.isHeld(code)) this.keyPrev.add(code);
    for (const d of this.im.allDevices) {
      const st = this.read(d);
      this.states.set(d.id, st);
    }
  }

  private read(d: InputDevice): DevState {
    d.sample(this.raw);
    const r = this.raw;
    return {
      up: r.stickY < -STICK ? 1 : 0,
      down: r.stickY > STICK ? 1 : 0,
      left: r.stickX < -STICK ? 1 : 0,
      right: r.stickX > STICK ? 1 : 0,
      confirm: (r.held & CONFIRM_BITS) !== 0,
      back: (r.held & BACK_BITS) !== 0,
      alt: (r.held & ALT_BITS) !== 0,
      start: d.kind === 'gamepad' && (r.held & Button.Pause) !== 0,
    };
  }

  /** Events since the last poll. The returned array is reused: copy what you need to keep. */
  poll(): readonly MenuEvent[] {
    const ev = this.events;
    ev.length = 0;
    for (const d of this.im.allDevices) {
      const cur = this.read(d);
      let prev = this.states.get(d.id);
      if (!prev) {
        prev = cur; // first sight of a device: do not fire for buttons it is already holding
        this.states.set(d.id, prev);
      }
      for (const dir of ['up', 'down', 'left', 'right'] as const) {
        if (cur[dir]) {
          const held = prev[dir] + 1;
          const fire = held === 1 || (held > REPEAT_DELAY && (held - REPEAT_DELAY) % REPEAT_RATE === 0);
          if (fire) ev.push({ action: dir, device: d });
          cur[dir] = held;
        }
      }
      if (cur.confirm && !prev.confirm) ev.push({ action: 'confirm', device: d });
      if (cur.back && !prev.back) ev.push({ action: 'back', device: d });
      if (cur.alt && !prev.alt) ev.push({ action: 'alt', device: d });
      if (cur.start && !prev.start) ev.push({ action: 'start', device: d });
      if (d.kind === 'keyboard' && (cur.up || cur.down || cur.left || cur.right || cur.confirm)) this.lastKeyboard = d;
      this.states.set(d.id, cur);
    }
    // universal keyboard keys are attributed to whichever keyboard scheme was used last
    const keys: [string, MenuAction][] = [['Enter', 'confirm'], ['Space', 'confirm'], ['Escape', 'back'], ['Backspace', 'back'], ['Tab', 'alt']];
    for (const [code, action] of keys) {
      const down = this.hub.isActive(code); // held, or tapped since the last frame (a quick tap on a slow frame still counts)
      if (down && !this.keyPrev.has(code)) ev.push({ action, device: this.lastKeyboard });
      if (down) this.keyPrev.add(code);
      else this.keyPrev.delete(code);
    }
    this.im.endTick();
    return ev;
  }
}

export const menuInput = new MenuInput();

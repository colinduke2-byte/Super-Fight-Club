import { Button } from '../engine/buttons';
import { makeRaw, type InputDevice, type RawInput } from './device';
import { inputManager, type InputManager } from './inputManager';
import { keyboardHub, type KeyboardHub } from './keyboard';
import { notePad, noteTouch } from './lastDevice';

export type MenuAction = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back' | 'alt' | 'start';

export interface MenuEvent {
  action: MenuAction;
  device: InputDevice;
  /** Set on events made by a pointer on a particular widget (a MenuList row): other widgets leave them alone. */
  target?: unknown;
  /** True for events injected by mouse / touch rather than read from a device. */
  pointer?: boolean;
  /** True for the keys every keyboard player shares (Enter, Space, Escape, Backspace, Tab), not one scheme's own. */
  shared?: boolean;
}

const STICK = 0.6;
// Time-based so menus feel the same at any refresh rate (same feel as the old 60 Hz frame counter, which first
// repeated 20 frames after the press, then every 5 frames).
const REPEAT_DELAY = 333; // ms before a held direction repeats
const REPEAT_RATE = 83; // ms between repeats

/** Keys every keyboard player can use in menus, and the scheme (1 = WASD, 2 = arrows) each belongs to. */
const SHARED_KEYS: [string, MenuAction, 1 | 2][] = [
  ['Enter', 'confirm', 2],
  ['Space', 'confirm', 1],
  ['Escape', 'back', 1],
  ['Backspace', 'back', 2],
  ['Tab', 'alt', 1],
];

const CONFIRM_BITS = Button.Attack | Button.Jump;
const BACK_BITS = Button.Special | Button.Shield;
const ALT_BITS = Button.Grab | Button.Smash | Button.Ultimate;

interface DevState {
  up: number; // time (performance.now ms) of the next auto-repeat (0 = not held)
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
 * Escape / Tab), every connected gamepad. Each frame `poll()` returns discrete events (with time-based
 * auto-repeat for held directions) tagged with the device that produced them, so character select can tell
 * players apart.
 *
 * Mapping: confirm = Attack or Jump (J / I, pad face buttons); back = Special or Shield (K / L, B / bumpers);
 * alt = Grab / Smash / Ultimate; start = gamepad Start only.
 */
export class MenuInput {
  private readonly states = new Map<string, DevState>();
  private readonly raw: RawInput = makeRaw();
  private readonly events: MenuEvent[] = [];
  private readonly keyPrev = new Set<string>();
  /** Keyboard schemes that have produced menu input through their own keys this session. */
  private readonly usedKeyboards = new Set<InputDevice>();
  /** Pointer-made events waiting for the next poll. */
  private readonly pending: MenuEvent[] = [];

  constructor(
    private readonly im: InputManager = inputManager,
    private readonly hub: KeyboardHub = keyboardHub,
    private readonly now: () => number = () => performance.now(),
  ) {}

  /** Treat everything currently held as already handled (call when a scene starts). */
  reset(): void {
    this.pending.length = 0;
    this.states.clear();
    this.keyPrev.clear();
    for (const [code] of SHARED_KEYS) if (this.hub.isHeld(code)) this.keyPrev.add(code);
    const now = this.now();
    for (const d of this.im.allDevices) {
      const st = this.read(d, now);
      this.states.set(d.id, st);
    }
  }

  /** Current state; a held direction counts as just pressed (first repeat due after REPEAT_DELAY). */
  private read(d: InputDevice, now: number): DevState {
    d.use?.('menu');
    d.sample(this.raw);
    const r = this.raw;
    const next = now + REPEAT_DELAY;
    return {
      up: r.stickY < -STICK ? next : 0,
      down: r.stickY > STICK ? next : 0,
      left: r.stickX < -STICK ? next : 0,
      right: r.stickX > STICK ? next : 0,
      confirm: (r.held & CONFIRM_BITS) !== 0,
      back: (r.held & BACK_BITS) !== 0,
      alt: (r.held & ALT_BITS) !== 0,
      start: (d.kind === 'gamepad' || d.kind === 'touch') && (r.held & Button.Pause) !== 0,
    };
  }

  /** Events since the last poll. The returned array is reused: copy what you need to keep. */
  poll(): readonly MenuEvent[] {
    const ev = this.events;
    ev.length = 0;
    for (const p of this.pending) ev.push(p);
    this.pending.length = 0;
    const now = this.now();
    for (const d of this.im.allDevices) {
      const cur = this.read(d, now);
      let prev = this.states.get(d.id);
      if (!prev) {
        prev = cur; // first sight of a device: do not fire for buttons it is already holding
        this.states.set(d.id, prev);
      }
      for (const dir of ['up', 'down', 'left', 'right'] as const) {
        if (!cur[dir]) continue;
        if (!prev[dir]) {
          ev.push({ action: dir, device: d }); // fresh press (cur already holds the first repeat time)
        } else if (now >= prev[dir]) {
          ev.push({ action: dir, device: d });
          // after a long hitch, resume the cadence from now rather than firing a burst of catch-up repeats
          const next = prev[dir] + REPEAT_RATE;
          cur[dir] = next > now ? next : now + REPEAT_RATE;
        } else {
          cur[dir] = prev[dir];
        }
      }
      if (cur.confirm && !prev.confirm) ev.push({ action: 'confirm', device: d });
      if (cur.back && !prev.back) ev.push({ action: 'back', device: d });
      if (cur.alt && !prev.alt) ev.push({ action: 'alt', device: d });
      if (cur.start && !prev.start) ev.push({ action: 'start', device: d });
      if (d.kind === 'gamepad' && cur !== prev && (cur.up || cur.down || cur.left || cur.right || cur.confirm || cur.back || cur.alt || cur.start)) notePad((d as { padId?: string }).padId ?? '');
      else if (d.kind === 'touch' && (cur.confirm || cur.back || cur.up || cur.down || cur.left || cur.right)) noteTouch();
      if (d.kind === 'keyboard' && (cur.up || cur.down || cur.left || cur.right || cur.confirm || cur.back || cur.alt)) this.usedKeyboards.add(d);
      this.states.set(d.id, cur);
    }
    // universal keyboard keys belong to the side of the keyboard they sit on (Space / Escape / Tab: WASD scheme,
    // Enter / Backspace: arrows scheme) once both schemes are in use; until then they all act for the one in use
    const [kb1, kb2] = this.im.keyboards;
    const both = this.usedKeyboards.has(kb1) && this.usedKeyboards.has(kb2);
    const solo = this.usedKeyboards.has(kb2) ? kb2 : kb1;
    for (const [code, action, side] of SHARED_KEYS) {
      const down = this.hub.isActive(code); // held, or tapped since the last frame (a quick tap on a slow frame still counts)
      if (down && !this.keyPrev.has(code)) ev.push({ action, device: both ? (side === 1 ? kb1 : kb2) : solo, shared: true });
      if (down) this.keyPrev.add(code);
      else this.keyPrev.delete(code);
    }
    this.im.endTick();
    return ev;
  }

  /** Queue an event made by a mouse / finger (menu rows, the BACK chip) for the next poll, so it flows like a key press. */
  inject(action: MenuAction, device: InputDevice, target?: unknown): void {
    this.pending.push({ action, device, target, pointer: true });
  }
}

export const menuInput = new MenuInput();

import { ACTION_BUTTON, BUTTON_ACTIONS, profileForPadId, type PadProfileId } from './actions';
import { bindings } from './bindings';
import { applyRadialDeadzone } from './deadzone';
import type { InputDevice, RawInput } from './device';
import { settings } from '../settings';

type PadListener = (index: number, id: string) => void;

/**
 * Tracks connected gamepads. The Gamepad API only reveals a pad after the user presses a button
 * on it (all browsers), and `getGamepads()` must be polled for fresh state (Chrome returns
 * snapshots). Works the same for USB, wireless dongles and Bluetooth pads (macOS/Windows).
 */
export class GamepadHub {
  private readonly known = new Map<number, string>();
  private attached = false;
  /**
   * Buttons pressed since the pad's last tick, per pad index (bit n = standard button n). The pads are polled between
   * frames as well (`latchPoll`), so a press shorter than one frame at a low frame rate is still seen once, the same way
   * the keyboard latches key taps. Cleared by InputManager.endTick.
   */
  private readonly latches = new Map<number, number>();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  /** Poll period between frames (ms). */
  static readonly POLL_MS = 6;
  onConnect: PadListener | null = null;
  onDisconnect: PadListener | null = null;

  attach(target: Window = window): void {
    if (this.attached) return;
    this.attached = true;
    target.addEventListener('gamepadconnected', (e) => {
      this.known.set(e.gamepad.index, e.gamepad.id);
      this.onConnect?.(e.gamepad.index, e.gamepad.id);
      this.syncPolling();
    });
    target.addEventListener('gamepaddisconnected', (e) => {
      this.known.delete(e.gamepad.index);
      this.latches.delete(e.gamepad.index);
      this.onDisconnect?.(e.gamepad.index, e.gamepad.id);
      this.syncPolling();
    });
    // pads already connected before the page loaded show up in getGamepads() without an event
    this.scan();
  }

  /** Re-sync with navigator.getGamepads() (covers browsers that miss/late-fire the events). */
  scan(): void {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    const seen = new Set<number>();
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i];
      if (!p || !p.connected) continue;
      seen.add(p.index);
      if (!this.known.has(p.index)) {
        this.known.set(p.index, p.id);
        this.onConnect?.(p.index, p.id);
      }
    }
    for (const idx of [...this.known.keys()]) {
      if (!seen.has(idx)) {
        const id = this.known.get(idx)!;
        this.known.delete(idx);
        this.latches.delete(idx);
        this.onDisconnect?.(idx, id);
      }
    }
    this.syncPolling();
  }

  /** Poll between frames only while a pad is connected. */
  private syncPolling(): void {
    if (typeof setInterval === 'undefined') return;
    if (this.known.size > 0 && !this.pollTimer) this.pollTimer = setInterval(this.latchPoll, GamepadHub.POLL_MS);
    else if (this.known.size === 0 && this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /** Read every known pad and remember the buttons that are down (see `latches`). */
  readonly latchPoll = (): void => {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    for (const idx of this.known.keys()) {
      const p = pads[idx];
      if (p && p.connected) this.latch(idx, buttonMask(p.buttons));
    }
  };

  /** Add pressed buttons (a mask) to a pad's latch. */
  latch(index: number, mask: number): void {
    if (mask) this.latches.set(index, (this.latches.get(index) ?? 0) | mask);
  }

  /** Buttons latched for a pad since its last clear. */
  latched(index: number): number {
    return this.latches.get(index) ?? 0;
  }

  clearLatches(): void {
    this.latches.clear();
  }

  get indices(): number[] {
    return [...this.known.keys()];
  }
  idOf(index: number): string | undefined {
    return this.known.get(index);
  }
}

const stickTmp = { x: 0, y: 0 };

export const gamepadHub = new GamepadHub();

/** Down buttons as a mask (bit n = standard-mapping button n, the first 32): pressed, or an analog trigger past 0.6. */
export function buttonMask(buttons: readonly { pressed: boolean; value: number }[]): number {
  let m = 0;
  for (let i = 0; i < buttons.length && i < 32; i++) {
    const b = buttons[i];
    if (b && (b.pressed || b.value > 0.6)) m |= 1 << i;
  }
  return m >>> 0;
}

/** Pure part of GamepadDevice.sample: stick (after the deadzone) + down-button mask -> RawInput, through a binding map. */
export function padSample(out: RawInput, ax: number, ay: number, mask: number, map: Record<string, number[]>, deadzone: number): void {
  applyRadialDeadzone(ax, ay, deadzone, stickTmp);
  let x = stickTmp.x;
  let y = stickTmp.y;
  const on = (n: number) => ((mask >>> n) & 1) === 1;
  // d-pad (standard mapping 12..15) acts as a digital stick
  if (on(14)) x = -1;
  else if (on(15)) x = 1;
  if (on(12)) y = -1;
  else if (on(13)) y = 1;
  out.stickX = x;
  out.stickY = y;
  let held = 0;
  for (let i = 0; i < BUTTON_ACTIONS.length; i++) {
    const act = BUTTON_ACTIONS[i];
    const list = map[act];
    for (let j = 0; j < list.length; j++) {
      if (on(list[j])) {
        held |= ACTION_BUTTON[act];
        break;
      }
    }
  }
  out.held = held;
}

export class GamepadDevice implements InputDevice {
  readonly kind = 'gamepad' as const;
  readonly id: string;
  private _label: string;

  constructor(
    readonly index: number,
    padId: string,
  ) {
    this.id = `gamepad:${index}`;
    this._label = shortPadName(padId);
  }

  get label(): string {
    return this._label;
  }

  /** A (possibly different) pad reconnected at this index: keep the object, refresh its name. */
  setPadId(padId: string): void {
    this._label = shortPadName(padId);
  }

  /** Short dual-motor rumble (Chromium / Edge; silently ignored where unsupported). */
  rumble(strong: number, weak: number, ms: number): void {
    if (!settings.rumble || typeof navigator === 'undefined' || !navigator.getGamepads) return;
    const act = (navigator.getGamepads()[this.index] as unknown as { vibrationActuator?: { playEffect?: (t: string, p: object) => Promise<unknown> } } | null)?.vibrationActuator;
    void act?.playEffect?.('dual-rumble', { startDelay: 0, duration: ms, strongMagnitude: Math.min(1, strong), weakMagnitude: Math.min(1, weak) })?.catch(() => undefined);
  }

  /** The browser's id string of the pad at this index ('' if unknown). */
  get padId(): string {
    return gamepadHub.idOf(this.index) ?? '';
  }

  get profile(): PadProfileId {
    return profileForPadId(gamepadHub.idOf(this.index) ?? '');
  }

  get connected(): boolean {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return false;
    const p = navigator.getGamepads()[this.index];
    return !!p && p.connected;
  }

  sample(out: RawInput): void {
    out.stickX = 0;
    out.stickY = 0;
    out.held = 0;
    const p = navigator.getGamepads()[this.index];
    if (!p || !p.connected) return;
    // what is down now, plus anything pressed and released since the last tick (polled between frames)
    const now = buttonMask(p.buttons);
    gamepadHub.latch(this.index, now);
    padSample(out, p.axes[0] ?? 0, p.axes[1] ?? 0, now | gamepadHub.latched(this.index), bindings.pads[this.profile] as Record<string, number[]>, settings.deadzone);
  }
}

function shortPadName(id: string): string {
  // Chrome: "Xbox 360 Controller (STANDARD GAMEPAD Vendor: 045e Product: 028e)"; Firefox: "045e-028e-Xbox ..."
  const cleaned = id.replace(/\(.*?\)/g, '').replace(/^[0-9a-f]{4}-[0-9a-f]{4}-/i, '').trim();
  return cleaned.length > 0 ? cleaned : 'Gamepad';
}

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
  onConnect: PadListener | null = null;
  onDisconnect: PadListener | null = null;

  attach(target: Window = window): void {
    if (this.attached) return;
    this.attached = true;
    target.addEventListener('gamepadconnected', (e) => {
      this.known.set(e.gamepad.index, e.gamepad.id);
      this.onConnect?.(e.gamepad.index, e.gamepad.id);
    });
    target.addEventListener('gamepaddisconnected', (e) => {
      this.known.delete(e.gamepad.index);
      this.onDisconnect?.(e.gamepad.index, e.gamepad.id);
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
        this.onDisconnect?.(idx, id);
      }
    }
  }

  get indices(): number[] {
    return [...this.known.keys()];
  }
  idOf(index: number): string | undefined {
    return this.known.get(index);
  }
}

export const gamepadHub = new GamepadHub();

const stickTmp = { x: 0, y: 0 };

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

  /** Short dual-motor rumble (Chromium / Edge; silently ignored where unsupported). */
  rumble(strong: number, weak: number, ms: number): void {
    if (!settings.rumble || typeof navigator === 'undefined' || !navigator.getGamepads) return;
    const act = (navigator.getGamepads()[this.index] as unknown as { vibrationActuator?: { playEffect?: (t: string, p: object) => Promise<unknown> } } | null)?.vibrationActuator;
    void act?.playEffect?.('dual-rumble', { startDelay: 0, duration: ms, strongMagnitude: Math.min(1, strong), weakMagnitude: Math.min(1, weak) })?.catch(() => undefined);
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

    const b = p.buttons;
    const a = p.axes;
    applyRadialDeadzone(a[0] ?? 0, a[1] ?? 0, settings.deadzone, stickTmp);
    let x = stickTmp.x;
    let y = stickTmp.y;
    // d-pad (standard mapping 12..15) acts as a digital stick
    if (b[14]?.pressed) x = -1;
    else if (b[15]?.pressed) x = 1;
    if (b[12]?.pressed) y = -1;
    else if (b[13]?.pressed) y = 1;
    out.stickX = x;
    out.stickY = y;

    const map = bindings.pads[this.profile];
    let held = 0;
    for (let i = 0; i < BUTTON_ACTIONS.length; i++) {
      const act = BUTTON_ACTIONS[i];
      const list = map[act];
      for (let j = 0; j < list.length; j++) {
        const btn = b[list[j]];
        if (btn && (btn.pressed || btn.value > 0.6)) {
          held |= ACTION_BUTTON[act];
          break;
        }
      }
    }
    out.held = held;
  }
}

function shortPadName(id: string): string {
  // Chrome: "Xbox 360 Controller (STANDARD GAMEPAD Vendor: 045e Product: 028e)"; Firefox: "045e-028e-Xbox ..."
  const cleaned = id.replace(/\(.*?\)/g, '').replace(/^[0-9a-f]{4}-[0-9a-f]{4}-/i, '').trim();
  return cleaned.length > 0 ? cleaned : 'Gamepad';
}

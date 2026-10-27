/** Raw, device-level sample. Stick axes are -1..1 (y DOWN-positive); held is a Button mask. */
export interface RawInput {
  stickX: number;
  stickY: number;
  held: number;
}

export type DeviceKind = 'keyboard' | 'gamepad' | 'merged' | 'touch';

export interface InputDevice {
  readonly id: string;
  readonly label: string;
  readonly kind: DeviceKind;
  /** False once a gamepad is unplugged. Keyboards are always connected. */
  readonly connected: boolean;
  /** Called once per sim tick. Must be allocation-free. */
  sample(out: RawInput): void;
  /** Optional: told who is reading it (a match player or the menus); the touch controller picks its layout from this. */
  use?(purpose: 'fight' | 'menu'): void;
}

export function makeRaw(): RawInput {
  return { stickX: 0, stickY: 0, held: 0 };
}

/**
 * Union of several devices (sandbox convenience: keyboard + whichever pad is plugged in). `lastKind` is the kind of device
 * last pressed, so the match reads it by that device's own rules (on the keys: W / Up jumps, a double-tap sprints).
 */
export class MergedDevice implements InputDevice {
  readonly kind = 'merged' as const;
  lastKind: 'keyboard' | 'gamepad' = 'keyboard';
  private readonly tmp: RawInput = makeRaw();
  constructor(
    readonly id: string,
    readonly label: string,
    private readonly devices: () => InputDevice[],
  ) {}
  get connected(): boolean {
    return true;
  }
  sample(out: RawInput): void {
    out.stickX = 0;
    out.stickY = 0;
    out.held = 0;
    const list = this.devices();
    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      d.sample(this.tmp);
      if ((d.kind === 'keyboard' || d.kind === 'gamepad') && (this.tmp.held !== 0 || Math.abs(this.tmp.stickX) > 0.5 || Math.abs(this.tmp.stickY) > 0.5)) this.lastKind = d.kind;
      if (Math.abs(this.tmp.stickX) > Math.abs(out.stickX)) out.stickX = this.tmp.stickX;
      if (Math.abs(this.tmp.stickY) > Math.abs(out.stickY)) out.stickY = this.tmp.stickY;
      out.held |= this.tmp.held;
    }
  }
}

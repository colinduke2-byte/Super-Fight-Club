/** Raw, device-level sample. Stick axes are -1..1 (y DOWN-positive); held is a Button mask. */
export interface RawInput {
  stickX: number;
  stickY: number;
  held: number;
}

export interface InputDevice {
  readonly id: string;
  readonly label: string;
  readonly kind: 'keyboard' | 'gamepad' | 'merged';
  /** False once a gamepad is unplugged. Keyboards are always connected. */
  readonly connected: boolean;
  /** Called once per sim tick. Must be allocation-free. */
  sample(out: RawInput): void;
}

export function makeRaw(): RawInput {
  return { stickX: 0, stickY: 0, held: 0 };
}

/** Union of several devices (sandbox convenience: keyboard + whichever pad is plugged in). */
export class MergedDevice implements InputDevice {
  readonly kind = 'merged' as const;
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
      list[i].sample(this.tmp);
      if (Math.abs(this.tmp.stickX) > Math.abs(out.stickX)) out.stickX = this.tmp.stickX;
      if (Math.abs(this.tmp.stickY) > Math.abs(out.stickY)) out.stickY = this.tmp.stickY;
      out.held |= this.tmp.held;
    }
  }
}

import { KeyboardDevice, keyboardHub } from './keyboard';
import { GamepadDevice, gamepadHub } from './gamepad';
import type { InputDevice } from './device';
import { bindings } from './bindings';
import { touchDevice, type TouchDevice } from './touch';

/**
 * Owns the device list: two keyboard schemes plus hot-plugged gamepads.
 * Call `endTick()` after each sim tick's input has been sampled.
 */
export class InputManager {
  readonly keyboards: KeyboardDevice[] = [new KeyboardDevice('kb1'), new KeyboardDevice('kb2')];
  readonly pads = new Map<number, GamepadDevice>();
  /** The on-screen touch controller: one device, listed once the screen has been touched. */
  readonly touch: TouchDevice = touchDevice;
  /** Every pad device ever created, by index: a pad that reconnects gets the same object back (callers compare by identity). */
  private readonly padDevices = new Map<number, GamepadDevice>();
  /** Fired when a pad connects / disconnects (UI toasts, pause-on-disconnect). */
  onPadConnect: ((d: GamepadDevice) => void) | null = null;
  onPadDisconnect: ((d: GamepadDevice) => void) | null = null;

  private started = false;

  init(): void {
    if (this.started) return;
    this.started = true;
    bindings.load();
    keyboardHub.attach();
    this.touch.attach();
    gamepadHub.onConnect = (idx, id) => this.padConnected(idx, id);
    gamepadHub.onDisconnect = (idx) => this.padDisconnected(idx);
    gamepadHub.attach();
  }

  /** Hub callback, public for tests. Reuses the device object of a pad that was at this index before. */
  padConnected(idx: number, id: string): void {
    let d = this.padDevices.get(idx);
    if (d) d.setPadId(id);
    else this.padDevices.set(idx, (d = new GamepadDevice(idx, id)));
    this.pads.set(idx, d);
    this.onPadConnect?.(d);
  }

  padDisconnected(idx: number): void {
    const d = this.pads.get(idx);
    this.pads.delete(idx);
    if (d) this.onPadDisconnect?.(d);
  }

  /** Cheap periodic re-scan (some browsers only expose pads after the first poll). */
  poll(): void {
    gamepadHub.scan();
  }

  get padList(): GamepadDevice[] {
    return [...this.pads.values()];
  }

  get allDevices(): InputDevice[] {
    const list: InputDevice[] = [...this.keyboards, ...this.padList];
    if (this.touch.used) list.push(this.touch);
    return list;
  }

  endTick(): void {
    keyboardHub.clearLatches();
    this.touch.clearLatches();
  }
}

export const inputManager = new InputManager();

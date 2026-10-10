import { KeyboardDevice, keyboardHub } from './keyboard';
import { GamepadDevice, gamepadHub } from './gamepad';
import type { InputDevice } from './device';
import { bindings } from './bindings';

/**
 * Owns the device list: two keyboard schemes plus hot-plugged gamepads.
 * Call `endTick()` after each sim tick's input has been sampled.
 */
export class InputManager {
  readonly keyboards: KeyboardDevice[] = [new KeyboardDevice('kb1'), new KeyboardDevice('kb2')];
  readonly pads = new Map<number, GamepadDevice>();
  /** Fired when a pad connects / disconnects (UI toasts, pause-on-disconnect). */
  onPadConnect: ((d: GamepadDevice) => void) | null = null;
  onPadDisconnect: ((d: GamepadDevice) => void) | null = null;

  private started = false;

  init(): void {
    if (this.started) return;
    this.started = true;
    bindings.load();
    keyboardHub.attach();
    gamepadHub.onConnect = (idx, id) => {
      const d = new GamepadDevice(idx, id);
      this.pads.set(idx, d);
      this.onPadConnect?.(d);
    };
    gamepadHub.onDisconnect = (idx) => {
      const d = this.pads.get(idx);
      this.pads.delete(idx);
      if (d) this.onPadDisconnect?.(d);
    };
    gamepadHub.attach();
  }

  /** Cheap periodic re-scan (some browsers only expose pads after the first poll). */
  poll(): void {
    gamepadHub.scan();
  }

  get padList(): GamepadDevice[] {
    return [...this.pads.values()];
  }

  get allDevices(): InputDevice[] {
    return [...this.keyboards, ...this.padList];
  }

  endTick(): void {
    keyboardHub.clearLatches();
  }
}

export const inputManager = new InputManager();

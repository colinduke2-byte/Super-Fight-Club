import { ALWAYS_PREVENT, ALL_ACTIONS, DIR_ACTIONS, BUTTON_ACTIONS, ACTION_BUTTON, type KeyboardSchemeId } from './actions';
import { bindings } from './bindings';
import type { InputDevice, RawInput } from './device';
import { noteKeyboard } from './lastDevice';

/**
 * Global keyboard state. Tracks held keys plus a "latch" of keys pressed since the last sample so a
 * tap shorter than one sim tick is never lost (important when the sim runs slower than key events).
 */
export class KeyboardHub {
  private readonly held = new Set<string>();
  private readonly latched = new Set<string>();
  private attached = false;
  /** Observers for menu code that wants raw key events (rebinding, menus). */
  onKeyDown: ((code: string, e: KeyboardEvent) => void) | null = null;

  attach(target: Window = window): void {
    if (this.attached) return;
    this.attached = true;
    target.addEventListener('keydown', this.down, { passive: false });
    target.addEventListener('keyup', this.up, { passive: false });
    target.addEventListener('blur', this.clear);
    document.addEventListener('visibilitychange', this.clear);
  }

  isHeld(code: string): boolean {
    return this.held.has(code);
  }
  /** Held or tapped since last `consumeLatch`. */
  isActive(code: string): boolean {
    return this.held.has(code) || this.latched.has(code);
  }
  clearLatches(): void {
    this.latched.clear();
  }

  private readonly down = (e: KeyboardEvent): void => {
    if (!(e.metaKey || e.ctrlKey || e.altKey) && (ALWAYS_PREVENT.has(e.code) || bindings.allBoundCodes().has(e.code))) {
      e.preventDefault(); // stop arrows/space from scrolling, Tab from moving focus, etc.
    }
    if (!e.repeat) {
      this.held.add(e.code);
      this.latched.add(e.code);
      noteKeyboard(schemeOf(e.code));
      this.onKeyDown?.(e.code, e);
    }
  };
  private readonly up = (e: KeyboardEvent): void => {
    if (ALWAYS_PREVENT.has(e.code)) e.preventDefault();
    this.held.delete(e.code);
  };
  private readonly clear = (): void => {
    this.held.clear();
    this.latched.clear();
  };
}

export const keyboardHub = new KeyboardHub();

/** The keyboard scheme a key is bound in (null for keys of neither, like Enter). */
export function schemeOf(code: string): KeyboardSchemeId | null {
  for (const id of ['kb1', 'kb2'] as const) for (const a of ALL_ACTIONS) if (bindings.keys[id][a].includes(code)) return id;
  return null;
}

export class KeyboardDevice implements InputDevice {
  readonly kind = 'keyboard' as const;
  readonly connected = true;
  readonly id: string;
  readonly label: string;

  constructor(
    readonly scheme: KeyboardSchemeId,
    private readonly hub: KeyboardHub = keyboardHub,
  ) {
    this.id = `keyboard:${scheme}`;
    this.label = scheme === 'kb1' ? 'Keyboard (WASD + JKLI)' : 'Keyboard (Arrows + Numpad)'; // CharacterSelect shortens these two by name
  }

  private any(codes: string[]): boolean {
    for (let i = 0; i < codes.length; i++) if (this.hub.isActive(codes[i])) return true;
    return false;
  }

  sample(out: RawInput): void {
    const map = bindings.keys[this.scheme];
    const l = this.any(map[DIR_ACTIONS[0]]);
    const r = this.any(map[DIR_ACTIONS[1]]);
    const u = this.any(map[DIR_ACTIONS[2]]);
    const d = this.any(map[DIR_ACTIONS[3]]);
    out.stickX = (r ? 1 : 0) - (l ? 1 : 0);
    out.stickY = (d ? 1 : 0) - (u ? 1 : 0);
    let held = 0;
    for (let i = 0; i < BUTTON_ACTIONS.length; i++) {
      const a = BUTTON_ACTIONS[i];
      if (this.any(map[a])) held |= ACTION_BUTTON[a];
    }
    out.held = held;
    // Latches are shared by every device reading this hub, so they are cleared by the owner of the
    // sim tick (InputManager.endTick), not here.
  }
}

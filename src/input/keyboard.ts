import { ALWAYS_PREVENT, ALL_ACTIONS, DIR_ACTIONS, BUTTON_ACTIONS, ACTION_BUTTON, RESERVED_KEYS, type KeyboardSchemeId } from './actions';
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
    } else if (isDevCombo(e) && this.onKeyDown) {
      // the game's own Ctrl / Alt hotkeys (Ctrl+F fullscreen, Ctrl+1 debug... see RESERVED_KEYS) while a scene listens for
      // them (a match): the browser's find bar, tab switching and history must not open as well
      e.preventDefault();
    }
    if (!e.repeat) {
      this.held.add(e.code);
      this.latched.add(e.code);
      noteKeyboard(promptScheme(e.code));
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

/**
 * Ctrl or Alt (not Cmd, not Shift) with one of the match's hotkeys: the game's developer / training combos. Browsers
 * refuse to let a page take a few combos (Ctrl+T, Ctrl+N, Ctrl+W), so prompts only advertise Ctrl+F and Ctrl+digits.
 */
export function isDevCombo(e: Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'altKey' | 'metaKey' | 'shiftKey'>): boolean {
  return (e.ctrlKey || e.altKey) && !e.metaKey && !e.shiftKey && RESERVED_KEYS.has(e.code);
}

/** Keys every keyboard player uses in menus (menuInput's shared keys): they say nothing about which side of the keyboard is in use. */
const SHARED_MENU_KEYS = new Set(['Enter', 'Space', 'Escape', 'Backspace', 'Tab', 'NumpadEnter']);

/**
 * The scheme a key press should switch the prompts to (null: leave them). Only a scheme's own buttons switch: a solo
 * player steering the menus with the arrows (keyboard 2's directions) and confirming with Enter keeps keyboard 1's
 * prompts, instead of being shown ", / ENTER".
 */
export function promptScheme(code: string): KeyboardSchemeId | null {
  if (SHARED_MENU_KEYS.has(code)) return null;
  for (const id of ['kb1', 'kb2'] as const) for (const a of BUTTON_ACTIONS) if (bindings.keys[id][a].includes(code)) return id;
  // keyboard 1's movement keys are its own; the arrows are shared with a solo player until keyboard 2 presses a button
  for (const a of DIR_ACTIONS) if (bindings.keys.kb1[a].includes(code)) return 'kb1';
  return null;
}

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

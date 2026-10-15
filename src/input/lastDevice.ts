import type { KeyboardSchemeId } from './actions';

export type PromptKind = 'keyboard' | 'gamepad' | 'touch';

/**
 * Which kind of device the player touched last, so on-screen prompts can name the right keys / buttons.
 * Written by the keyboard hub, menu input, player input and the touch controller; read by `prompts.ts`.
 */
export const lastInput = {
  kind: initialKind() as PromptKind,
  /** Keyboard scheme of the last key that belongs to one (shared keys like Enter leave it alone). */
  scheme: 'kb1' as KeyboardSchemeId,
  /** Browser id string of the last gamepad used ('' until one is). */
  padId: '',
  /** Bumped on every change, so a scene can cheaply tell when to refresh its prompts. */
  serial: 0,
};

function initialKind(): PromptKind {
  // a phone or tablet with no fine pointer starts out in touch prompts, before anything is pressed
  try {
    if (typeof matchMedia !== 'undefined' && matchMedia('(hover: none) and (pointer: coarse)').matches) return 'touch';
  } catch {
    /* no matchMedia (tests) */
  }
  return 'keyboard';
}

export function noteKeyboard(scheme: KeyboardSchemeId | null): void {
  if (lastInput.kind === 'keyboard' && (scheme === null || scheme === lastInput.scheme)) return;
  lastInput.kind = 'keyboard';
  if (scheme) lastInput.scheme = scheme;
  lastInput.serial++;
}

export function notePad(padId: string): void {
  if (lastInput.kind === 'gamepad' && lastInput.padId === padId) return;
  lastInput.kind = 'gamepad';
  lastInput.padId = padId;
  lastInput.serial++;
}

export function noteTouch(): void {
  if (lastInput.kind === 'touch') return;
  lastInput.kind = 'touch';
  lastInput.serial++;
}

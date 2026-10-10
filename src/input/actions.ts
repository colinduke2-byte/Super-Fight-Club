import { Button } from '../engine/buttons';

export type DirAction = 'left' | 'right' | 'up' | 'down';
export type ButtonAction = 'jump' | 'attack' | 'special' | 'shield' | 'grab' | 'smash' | 'ultimate' | 'pause';
export type Action = DirAction | ButtonAction;

export const DIR_ACTIONS: DirAction[] = ['left', 'right', 'up', 'down'];
export const BUTTON_ACTIONS: ButtonAction[] = ['jump', 'attack', 'special', 'shield', 'grab', 'smash', 'ultimate', 'pause'];
export const ALL_ACTIONS: Action[] = [...DIR_ACTIONS, ...BUTTON_ACTIONS];

export const ACTION_LABEL: Record<Action, string> = {
  left: 'Left',
  right: 'Right',
  up: 'Up',
  down: 'Down',
  jump: 'Jump',
  attack: 'Attack',
  special: 'Special',
  shield: 'Shield',
  grab: 'Grab',
  smash: 'Smash',
  ultimate: 'Ultimate',
  pause: 'Pause',
};

export const ACTION_BUTTON: Record<ButtonAction, number> = {
  jump: Button.Jump,
  attack: Button.Attack,
  special: Button.Special,
  shield: Button.Shield,
  grab: Button.Grab,
  smash: Button.Smash,
  ultimate: Button.Ultimate,
  pause: Button.Pause,
};

/** `KeyboardEvent.code` values per action. Using `code` keeps bindings layout-independent (AZERTY etc.). */
export type KeyBindings = Record<Action, string[]>;
/** Standard-mapping gamepad button indices per button action. */
export type PadBindings = Record<ButtonAction, number[]>;

export type KeyboardSchemeId = 'kb1' | 'kb2';

export const DEFAULT_KEY_SCHEMES: Record<KeyboardSchemeId, KeyBindings> = {
  // P1: WASD + J K L I (+ U grab, O smash, Q ultimate, Escape pause)
  kb1: {
    left: ['KeyA'],
    right: ['KeyD'],
    up: ['KeyW'],
    down: ['KeyS'],
    jump: ['KeyI'],
    attack: ['KeyJ'],
    special: ['KeyK'],
    shield: ['KeyL'],
    grab: ['KeyU'],
    smash: ['KeyO'],
    ultimate: ['KeyQ'],
    pause: ['Escape'],
  },
  // P2: arrows + numpad (laptop-friendly alternates on , . / and right shift)
  kb2: {
    left: ['ArrowLeft'],
    right: ['ArrowRight'],
    up: ['ArrowUp'],
    down: ['ArrowDown'],
    jump: ['Numpad5', 'ShiftRight'],
    attack: ['Numpad1', 'Comma'],
    special: ['Numpad2', 'Period'],
    shield: ['Numpad3', 'Slash'],
    grab: ['Numpad4', 'Semicolon'],
    smash: ['Numpad6', 'Quote'],
    ultimate: ['Numpad0', 'BracketRight'],
    pause: ['NumpadEnter'],
  },
};

export type PadProfileId = 'nintendo' | 'standard';

/**
 * Per-device defaults, expressed in the browser's "standard" gamepad layout (positional):
 * 0 = bottom face, 1 = right, 2 = left, 3 = top, 4/5 = bumpers, 6/7 = triggers, 9 = start.
 * Xbox / PlayStation / generic pads share a layout; Nintendo pads swap the face labels so we
 * map by label (A = right button attacks, B = bottom button specials) to match muscle memory.
 */
export const DEFAULT_PAD_PROFILES: Record<PadProfileId, PadBindings> = {
  // Xbox / PlayStation / generic (positional): Smash-style. A attack, B special, X / Y jump, LB / RB grab, LT / RT shield,
  // R3 smash (a flick of the stick + attack also smashes), L3 ultimate, Menu pause.
  standard: {
    jump: [2, 3],
    attack: [0],
    special: [1],
    shield: [6, 7],
    grab: [4, 5],
    smash: [11],
    ultimate: [10],
    pause: [9],
  },
  // Nintendo layout (A is the right button, B the bottom one): same physical positions as Smash on Switch.
  nintendo: {
    jump: [2, 3],
    attack: [1],
    special: [0],
    shield: [6, 7],
    grab: [4, 5],
    smash: [11],
    ultimate: [10],
    pause: [9],
  },
};

export function profileForPadId(id: string): PadProfileId {
  const s = id.toLowerCase();
  if (s.includes('057e') || s.includes('nintendo') || s.includes('switch') || s.includes('pro controller')) return 'nintendo';
  return 'standard';
}

/** Keys the page must never let the browser act on (scroll, tab focus, ...). */
export const ALWAYS_PREVENT = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
  'Tab',
  'Backspace',
  'PageUp',
  'PageDown',
  'Home',
  'End',
]);

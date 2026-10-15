import { ACTION_LABEL, profileForPadId, type Action, type ButtonAction, type DirAction, type KeyboardSchemeId, type PadProfileId } from './actions';
import { bindings } from './bindings';
import type { InputDevice } from './device';
import { lastInput, type PromptKind } from './lastDevice';

/**
 * On-screen prompts generated from the live bindings and the device in use, so every hint names the key or button the
 * player actually has to press (rebinds included).
 *
 *   promptFor('attack')               -> 'J' (keyboard 1), ',' (keyboard 2), 'A' (Xbox / Nintendo), 'CROSS' (PlayStation), 'ATTACK' (touch)
 *   menuPrompt('confirm')             -> 'J / ENTER', 'A', 'TAP'
 *   footerHint([['updown', 'MOVE'], ['confirm', 'SELECT'], ['back', 'BACK']])
 *                                     -> 'UP/DOWN: MOVE   J / ENTER: SELECT   K / ESC: BACK'
 *
 * With no device given, the last device used is meant (see lastDevice.ts). Every string uses only glyphs the pixel font has.
 */

export { lastInput, type PromptKind } from './lastDevice';

/** Words for keys whose character the pixel font lacks (or that read better as a word). */
const KEY_WORDS: Record<string, string> = {
  ShiftLeft: 'LEFT SHIFT',
  ShiftRight: 'RIGHT SHIFT',
  ControlLeft: 'LEFT CTRL',
  ControlRight: 'RIGHT CTRL',
  AltLeft: 'LEFT ALT',
  AltRight: 'RIGHT ALT',
  MetaLeft: 'LEFT CMD',
  MetaRight: 'RIGHT CMD',
  Space: 'SPACE',
  Enter: 'ENTER',
  NumpadEnter: 'NUM ENTER',
  Escape: 'ESC',
  Backspace: 'BACKSPACE',
  Tab: 'TAB',
  CapsLock: 'CAPS LOCK',
  Delete: 'DEL',
  Insert: 'INS',
  Home: 'HOME',
  End: 'END',
  PageUp: 'PAGE UP',
  PageDown: 'PAGE DOWN',
  ArrowUp: 'UP',
  ArrowDown: 'DOWN',
  ArrowLeft: 'LEFT',
  ArrowRight: 'RIGHT',
  ContextMenu: 'MENU',
  // punctuation the font can draw shows as itself
  Comma: ',',
  Period: '.',
  Slash: '/',
  Quote: "'",
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  // ...and the rest by name (the font has no ; \ ` glyphs)
  Semicolon: 'SEMICOLON',
  Backslash: 'BACKSLASH',
  IntlBackslash: 'BACKSLASH',
  Backquote: 'BACKTICK',
  NumpadAdd: 'NUM +',
  NumpadSubtract: 'NUM -',
  NumpadMultiply: 'NUM *',
  NumpadDivide: 'NUM /',
  NumpadDecimal: 'NUM .',
};

/** Human-readable name of a `KeyboardEvent.code`: 'KeyJ' -> 'J', 'ShiftRight' -> 'RIGHT SHIFT', 'Quote' -> "'". */
export function keyLabel(code: string): string {
  const w = KEY_WORDS[code];
  if (w) return w;
  let m = /^Key([A-Z])$/.exec(code);
  if (m) return m[1];
  m = /^Digit(\d)$/.exec(code);
  if (m) return m[1];
  m = /^Numpad(\d)$/.exec(code);
  if (m) return `NUM ${m[1]}`;
  // anything else: split the camel case ('PrintScreen' -> 'PRINT SCREEN'), keeping only drawable characters
  return code
    .replace(/([a-z])([A-Z0-9])/g, '$1 $2')
    .toUpperCase()
    .replace(/[^ A-Z0-9%!?.,:\-+/'()=@*[\]<>|_#"]/g, '');
}

export type PadStyle = 'xbox' | 'nintendo' | 'playstation';

const PAD_LABELS: Record<PadStyle, string[]> = {
  // standard-mapping indices 0..16
  xbox: ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'VIEW', 'MENU', 'L3', 'R3', 'D-UP', 'D-DOWN', 'D-LEFT', 'D-RIGHT', 'HOME'],
  // Nintendo pads put A on the right and B on the bottom (positions 1 and 0)
  nintendo: ['B', 'A', 'Y', 'X', 'L', 'R', 'ZL', 'ZR', '-', '+', 'L-STICK', 'R-STICK', 'D-UP', 'D-DOWN', 'D-LEFT', 'D-RIGHT', 'HOME'],
  playstation: ['CROSS', 'CIRCLE', 'SQUARE', 'TRIANGLE', 'L1', 'R1', 'L2', 'R2', 'SHARE', 'OPTIONS', 'L3', 'R3', 'D-UP', 'D-DOWN', 'D-LEFT', 'D-RIGHT', 'PS'],
};

/** Face-button naming of a pad, from its browser id. */
export function padStyleForId(id: string): PadStyle {
  const s = id.toLowerCase();
  if (profileForPadId(id) === 'nintendo') return 'nintendo';
  if (s.includes('054c') || s.includes('playstation') || s.includes('dualshock') || s.includes('dualsense') || s.includes('ps4') || s.includes('ps5')) return 'playstation';
  return 'xbox';
}

/** Name of a standard-mapping button index as printed on that style of pad. */
export function padButtonLabel(n: number, style: PadStyle = 'xbox'): string {
  return PAD_LABELS[style][n] ?? `BTN ${n}`;
}

/** What a prompt is drawn for: a kind, plus the scheme / pad that decides the exact key. */
interface Target {
  kind: PromptKind;
  scheme: KeyboardSchemeId;
  profile: PadProfileId;
  style: PadStyle;
}

function target(device?: InputDevice | null): Target {
  if (device && device.kind !== 'merged') {
    if (device.kind === 'keyboard') return { kind: 'keyboard', scheme: (device as { scheme?: KeyboardSchemeId }).scheme ?? 'kb1', profile: 'standard', style: 'xbox' };
    if (device.kind === 'gamepad') {
      const id = (device as { padId?: string }).padId ?? '';
      return { kind: 'gamepad', scheme: 'kb1', profile: profileForPadId(id), style: padStyleForId(id) };
    }
    return { kind: 'touch', scheme: 'kb1', profile: 'standard', style: 'xbox' };
  }
  return { kind: lastInput.kind, scheme: lastInput.scheme, profile: profileForPadId(lastInput.padId), style: padStyleForId(lastInput.padId) };
}

const DIR_WORD: Record<DirAction, string> = { left: 'LEFT', right: 'RIGHT', up: 'UP', down: 'DOWN' };

/** The key / button / touch control for a game action on `device` (default: the last device used). */
export function promptFor(action: Action, device?: InputDevice | null): string {
  const t = target(device);
  if (t.kind === 'keyboard') {
    const codes = bindings.keys[t.scheme][action];
    return codes.length ? keyLabel(codes[0]) : 'UNBOUND';
  }
  if (action === 'left' || action === 'right' || action === 'up' || action === 'down') return t.kind === 'touch' ? `STICK ${DIR_WORD[action]}` : DIR_WORD[action];
  if (t.kind === 'touch') return action === 'pause' ? 'II' : ACTION_LABEL[action].toUpperCase();
  const btns = bindings.pads[t.profile][action as ButtonAction];
  return btns.length ? padButtonLabel(btns[0], t.style) : 'UNBOUND';
}

/** The movement keys of a keyboard scheme in one word: 'WASD', 'ARROWS', or the four keys. */
export function moveLabel(scheme: KeyboardSchemeId): string {
  const k = bindings.keys[scheme];
  const first = (['up', 'left', 'down', 'right'] as const).map((a) => k[a][0] ?? '');
  if (first.every((c) => c.startsWith('Arrow'))) return 'ARROWS';
  const names = first.map((c) => (c ? keyLabel(c) : '?'));
  return names.every((n) => n.length === 1) ? names.join('') : names.join('/');
}

/** Menu verbs a footer can name. */
export type MenuVerb = 'confirm' | 'back' | 'alt' | 'start' | 'updown' | 'leftright' | 'move';

/** The control for a menu verb (menus accept the action's binding plus the shared keys: Enter / Space, Escape / Backspace, Tab). */
export function menuPrompt(verb: MenuVerb, device?: InputDevice | null): string {
  const t = target(device);
  if (verb === 'updown') return t.kind === 'gamepad' ? 'D-PAD' : 'UP/DOWN';
  if (verb === 'leftright') return 'LEFT/RIGHT';
  if (verb === 'move') return t.kind === 'keyboard' ? `${moveLabel('kb1')} / ARROWS` : t.kind === 'gamepad' ? 'STICK / D-PAD' : 'ARROWS';
  if (t.kind === 'touch') return verb === 'confirm' ? 'TAP' : verb === 'back' ? 'BACK' : verb === 'start' ? 'START' : 'TAP';
  if (t.kind === 'gamepad') return padLabelFor(verb === 'confirm' ? 'attack' : verb === 'back' ? 'special' : verb === 'alt' ? 'grab' : 'pause', t);
  // keyboard: the scheme's own key first, then the shared key on its side of the keyboard
  const k = bindings.keys[t.scheme];
  const own = (a: Action) => (k[a][0] ? keyLabel(k[a][0]) : '');
  const pair = (a: Action, shared: string) => [own(a), shared].filter(Boolean).join(' / ');
  if (verb === 'confirm') return pair('attack', 'ENTER');
  if (verb === 'back') return pair('special', t.scheme === 'kb2' ? 'BACKSPACE' : 'ESC');
  if (verb === 'alt') return pair('grab', 'TAB');
  return own('pause') || 'ESC';
}

function padLabelFor(a: ButtonAction, t: Target): string {
  const b = bindings.pads[t.profile][a];
  return b.length ? padButtonLabel(b[0], t.style) : 'UNBOUND';
}

/** A footer line: `[['confirm', 'SELECT'], ['back', 'BACK']]` -> 'J / ENTER: SELECT   K / ESC: BACK' (for the given or last device). */
export function footerHint(entries: readonly (readonly [MenuVerb, string])[], device?: InputDevice | null): string {
  return entries.map(([v, label]) => `${menuPrompt(v, device)}: ${label}`).join('   ').toUpperCase();
}

/** Changes whenever the last-used device does: compare it each frame to know when to rebuild prompt text. */
export function promptSerial(): number {
  return lastInput.serial;
}

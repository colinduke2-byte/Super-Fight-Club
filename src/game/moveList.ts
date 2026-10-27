import type { CharacterData } from '../engine/types';
import type { InputDevice } from '../input/device';
import { promptFor, wrapText } from '../input/prompts';
import { deviceKind } from './tutorial';

/** How a move is input: an optional direction (relative to facing), a button, and whether it is done in the air. */
type Dir = '' | 'side' | 'up' | 'down' | 'fwd' | 'back' | 'run';
type Btn = 'attack' | 'special' | 'grab' | 'smash' | 'ultimate';
interface Input {
  dir: Dir;
  btn: Btn;
  air?: boolean;
  /** Throws: the direction comes after the grab. */
  then?: boolean;
}

/** The moves, in the order a player learns them. */
const ENTRIES: [string, Input][] = [
  ['jab1', { dir: '', btn: 'attack' }],
  ['ftilt', { dir: 'side', btn: 'attack' }],
  ['utilt', { dir: 'up', btn: 'attack' }],
  ['dtilt', { dir: 'down', btn: 'attack' }],
  ['dashAttack', { dir: 'run', btn: 'attack' }],
  ['fsmash', { dir: 'side', btn: 'smash' }],
  ['usmash', { dir: 'up', btn: 'smash' }],
  ['dsmash', { dir: 'down', btn: 'smash' }],
  ['nair', { dir: '', btn: 'attack', air: true }],
  ['fair', { dir: 'fwd', btn: 'attack', air: true }],
  ['bair', { dir: 'back', btn: 'attack', air: true }],
  ['uair', { dir: 'up', btn: 'attack', air: true }],
  ['dair', { dir: 'down', btn: 'attack', air: true }],
  ['neutralB', { dir: '', btn: 'special' }],
  ['sideB', { dir: 'side', btn: 'special' }],
  ['upB', { dir: 'up', btn: 'special' }],
  ['downB', { dir: 'down', btn: 'special' }],
  ['grab', { dir: '', btn: 'grab' }],
  ['fthrow', { dir: 'fwd', btn: 'grab', then: true }],
  ['bthrow', { dir: 'back', btn: 'grab', then: true }],
  ['uthrow', { dir: 'up', btn: 'grab', then: true }],
  ['dthrow', { dir: 'down', btn: 'grab', then: true }],
  ['ultimate', { dir: '', btn: 'ultimate' }],
];

/**
 * The input for a move on `device` (none: the last device used): keyboard keys by name ("A/D + J", "AIR S + J"),
 * pad buttons ("SIDE + A") or the touch controls' labels ("SIDE + ATTACK").
 */
export function inputText(i: Input, device?: InputDevice | null): string {
  const kind = deviceKind(device);
  const P = (a: Parameters<typeof promptFor>[0]): string => promptFor(a, device);
  const keys = kind === 'keyboard';
  const dir: Record<Dir, string> = {
    '': '',
    side: keys ? `${P('left')}/${P('right')}` : 'SIDE',
    up: keys ? P('up') : 'UP',
    down: keys ? P('down') : 'DOWN',
    fwd: 'FWD',
    back: 'BACK',
    run: 'RUN',
  };
  const d = dir[i.dir];
  const b = P(i.btn);
  const body = i.then ? `${b}, ${d}` : d ? `${d} + ${b}` : b;
  return `${i.air ? 'AIR ' : ''}${body}`;
}

export interface MoveListRow {
  input: string;
  name: string;
  /** Strongest hit (0 for moves that work through projectiles, traps or transformations). */
  damage: number;
  /** First active frame. */
  frame: number;
}

/** The fighter's moves with their inputs for `device` (variant moves such as Nova's elements list the first variant). */
export function moveList(data: CharacterData, device?: InputDevice | null): MoveListRow[] {
  const out: MoveListRow[] = [];
  for (const [id, input] of ENTRIES) {
    const m = data.moves[id] ?? Object.entries(data.moves).find(([k]) => k.startsWith(`${id}_`))?.[1];
    if (!m || m.hidden) continue;
    const dmg = Math.max(0, ...m.hitboxes.map((h) => h.damage ?? 0));
    out.push({ input: inputText(input, device), name: displayName(id, m.name), damage: Math.round(dmg * 10) / 10, frame: m.startup + 1 });
  }
  return out;
}

/**
 * A move's name as the list shows it. The first hit of a jab string is named like the whole string ('Rapid Slash', not
 * 'Rapid Slash 1'), as the other fighters' multi-hit moves are; the move data keeps its numbered names.
 */
function displayName(id: string, name: string | undefined): string {
  if (!name) return id;
  return id === 'jab1' ? name.replace(/\s+1$/, '') : name;
}

/** Fixed-width text block for the pause screen, with a key to its columns (FWD / BACK are relative to where you face). */
export function moveListText(data: CharacterData, device?: InputDevice | null): string {
  const rows = moveList(data, device);
  const iw = Math.max(16, ...rows.map((r) => r.input.length + 2));
  // every line fits the table's width, so the panel (sized to the widest line) has no empty right half
  const tw = iw + 22 + 5 + 7;
  const lines = [`${data.name.toUpperCase()}  -  MOVE LIST`, wrapText((data.tagline ?? '').toUpperCase(), tw), '', `${'INPUT'.padEnd(iw)}${'MOVE'.padEnd(22)}${'DMG'.padStart(5)}${'FRAME'.padStart(7)}`];
  for (const r of rows) {
    lines.push(`${r.input.padEnd(iw)}${r.name.toUpperCase().slice(0, 21).padEnd(22)}${(r.damage > 0 ? String(r.damage) : '-').padStart(5)}${String(r.frame).padStart(7)}`);
  }
  lines.push('', 'DMG: DAMAGE %.  FRAME: HOW SOON IT HITS', '(60 FRAMES = 1 SECOND, LOWER IS FASTER).', 'FWD / BACK: TOWARD / AWAY FROM WHERE YOU FACE.');
  return lines.join('\n');
}

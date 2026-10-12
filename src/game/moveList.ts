import type { CharacterData } from '../engine/types';

/** Inputs as shown in the move list, in the order a player learns them. */
const ENTRIES: [string, string][] = [
  ['jab1', 'ATTACK'],
  ['ftilt', 'SIDE+ATTACK'],
  ['utilt', 'UP+ATTACK'],
  ['dtilt', 'DOWN+ATTACK'],
  ['dashAttack', 'RUN+ATTACK'],
  ['fsmash', 'SIDE SMASH'],
  ['usmash', 'UP SMASH'],
  ['dsmash', 'DOWN SMASH'],
  ['nair', 'AIR ATTACK'],
  ['fair', 'AIR FWD+ATTACK'],
  ['bair', 'AIR BACK+ATTACK'],
  ['uair', 'AIR UP+ATTACK'],
  ['dair', 'AIR DOWN+ATTACK'],
  ['neutralB', 'SPECIAL'],
  ['sideB', 'SIDE+SPECIAL'],
  ['upB', 'UP+SPECIAL'],
  ['downB', 'DOWN+SPECIAL'],
  ['grab', 'GRAB'],
  ['fthrow', 'GRAB, FWD'],
  ['bthrow', 'GRAB, BACK'],
  ['uthrow', 'GRAB, UP'],
  ['dthrow', 'GRAB, DOWN'],
  ['ultimate', 'ULTIMATE'],
];

export interface MoveListRow {
  input: string;
  name: string;
  /** Strongest hit (0 for moves that work through projectiles, traps or transformations). */
  damage: number;
  /** First active frame. */
  frame: number;
}

/** The fighter's moves with their inputs (variant moves such as Nova's elements list the first variant). */
export function moveList(data: CharacterData): MoveListRow[] {
  const out: MoveListRow[] = [];
  for (const [id, input] of ENTRIES) {
    const m = data.moves[id] ?? Object.entries(data.moves).find(([k]) => k.startsWith(`${id}_`))?.[1];
    if (!m || m.hidden) continue;
    const dmg = Math.max(0, ...m.hitboxes.map((h) => h.damage ?? 0));
    out.push({ input, name: m.name ?? id, damage: Math.round(dmg * 10) / 10, frame: m.startup + 1 });
  }
  return out;
}

/** Fixed-width text block for the pause screen. */
export function moveListText(data: CharacterData): string {
  const rows = moveList(data);
  const lines = [`${data.name.toUpperCase()}  -  MOVE LIST`, (data.tagline ?? '').toUpperCase(), '', `${'INPUT'.padEnd(16)}${'MOVE'.padEnd(22)}${'DMG'.padStart(5)}${'F'.padStart(4)}`];
  for (const r of rows) {
    lines.push(`${r.input.padEnd(16)}${r.name.toUpperCase().slice(0, 21).padEnd(22)}${(r.damage > 0 ? String(r.damage) : '-').padStart(5)}${String(r.frame).padStart(4)}`);
  }
  lines.push('', 'ANY BUTTON: BACK');
  return lines.join('\n');
}
